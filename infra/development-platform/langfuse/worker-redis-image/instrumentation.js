"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dd_trace_1 = __importDefault(require("dd-trace"));
const sdk_node_1 = require("@opentelemetry/sdk-node");
const exporter_trace_otlp_proto_1 = require("@opentelemetry/exporter-trace-otlp-proto");
const instrumentation_ioredis_1 = require("@opentelemetry/instrumentation-ioredis");
const instrumentation_http_1 = require("@opentelemetry/instrumentation-http");
const instrumentation_undici_1 = require("@opentelemetry/instrumentation-undici");
const instrumentation_express_1 = require("@opentelemetry/instrumentation-express");
const instrumentation_1 = require("@prisma/instrumentation");
const instrumentation_winston_1 = require("@opentelemetry/instrumentation-winston");
const instrumentation_aws_sdk_1 = require("@opentelemetry/instrumentation-aws-sdk");
const opentelemetry_instrumentation_bullmq_1 = require("@appsignal/opentelemetry-instrumentation-bullmq");
const bootstrap_1 = require("@langfuse/shared/instrumentation/bootstrap");
const resources_1 = require("@opentelemetry/resources");
const resource_detector_aws_1 = require("@opentelemetry/resource-detector-aws");
const resource_detector_container_1 = require("@opentelemetry/resource-detector-container");
const env_1 = require("./env");
dd_trace_1.default.init({
    runtimeMetrics: true,
    plugins: false,
});
const getUndiciRequestUrl = (origin, path) => {
    try {
        return new URL(path, origin);
    }
    catch {
        return null;
    }
};
const sdk = new sdk_node_1.NodeSDK({
    resource: (0, resources_1.resourceFromAttributes)({
        "service.name": env_1.env.OTEL_SERVICE_NAME,
        "service.version": env_1.env.BUILD_ID,
    }),
    traceExporter: new exporter_trace_otlp_proto_1.OTLPTraceExporter({
        url: `${env_1.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
        new instrumentation_ioredis_1.IORedisInstrumentation({ requestHook: bootstrap_1.ioredisRequestHook }),
        new instrumentation_http_1.HttpInstrumentation({
            requireParentforOutgoingSpans: true,
            ignoreIncomingRequestHook: (req) => {
                // Ignore health checks
                return ["/api/public/health", "/api/public/ready", "/api/health"].some((path) => req.url?.includes(path));
            },
            ignoreOutgoingRequestHook: (req) => {
                return req.host === "127.0.0.1";
            },
            requestHook: (span, req) => {
                const url = "path" in req ? req?.path : req?.url;
                let path = new URL(url, `http://${req?.host ?? "localhost"}`).pathname;
                if (path.startsWith("/_next/static")) {
                    path = "/_next/static/*";
                }
                span.updateName(`${req?.method} ${path}`);
            },
        }),
        new instrumentation_undici_1.UndiciInstrumentation({
            requireParentforSpans: true,
            ignoreRequestHook: (request) => {
                const url = getUndiciRequestUrl(request.origin, request.path);
                return url?.hostname === "127.0.0.1" || url?.hostname === "localhost";
            },
            startSpanHook: (request) => {
                const url = getUndiciRequestUrl(request.origin, request.path);
                return url
                    ? {
                        "url.full": `${url.origin}${url.pathname}`,
                        "url.query": "",
                    }
                    : {};
            },
            requestHook: (span, request) => {
                const url = getUndiciRequestUrl(request.origin, request.path);
                if (url) {
                    span.updateName(`${request.method} ${url.pathname}`);
                }
            },
        }),
        new instrumentation_express_1.ExpressInstrumentation(),
        new instrumentation_1.PrismaInstrumentation({
            ignoreSpanTypes: [
                "prisma:client:serialize",
                "prisma:engine:query",
                "prisma:engine:connection",
                "prisma:engine:serialize",
                "prisma:engine:response_json_serialization",
            ],
        }),
        new instrumentation_aws_sdk_1.AwsInstrumentation(),
        new instrumentation_winston_1.WinstonInstrumentation({ disableLogSending: true }),
        new opentelemetry_instrumentation_bullmq_1.BullMQInstrumentation({ useProducerSpanAsConsumerParent: true }),
    ],
    resourceDetectors: [resources_1.envDetector, resource_detector_aws_1.awsEcsDetector, resource_detector_container_1.containerDetector],
});
sdk.start();
let shutdownPromise = null;
const shutdownInstrumentation = () => {
    if (!shutdownPromise) {
        shutdownPromise = Promise.resolve().then(() => sdk.shutdown());
    }
    return shutdownPromise;
};
exports.shutdownInstrumentation = shutdownInstrumentation;
