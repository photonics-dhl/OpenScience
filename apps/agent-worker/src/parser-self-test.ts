import { createDefaultIngestionAdapters, parseIngestionWithAdapters, type ParsedIngestion } from './ingestion-parser';

const EXPECTED_TEXT = 'OpenScience evidence document';

// Small deterministic fixtures generated from the ISO PDF and OOXML container structures.
// They contain no user data and let the deployed worker prove its native parser runtime.
const PDF_FIXTURE = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjAgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MjAgVGQgKE9wZW5TY2llbmNlIGV2aWRlbmNlIGRvY3VtZW50KSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDIxCiUlRU9GCg==',
  'base64',
);

const DOCX_FIXTURE = Buffer.from(
  'UEsDBBQAAAAIAAO4CV15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAA7gJXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAAO4CV025I2sqwAAAPEAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjk0OgjAQha/SdC9FF8YQwJ1bTdQD1HaEJnSGdCrI7W0xxs2b/29efXz7QUwQ2BE2cluUUgAasg67Rt5vp81BCo4arR4IoZELsDy29VxZMi8PGEUCIFdzI/sYx0opNj14zQWNgGn2pOB1TGXo1EzBjoEMMCe+H9SuLPfKa4cyIx9klxzHLCFLbM+JcjUueQIBk7Nr8vtdq7ySNay6HjKYeAlqbXyJ6u+2/QBQSwECFAAUAAAACAADuAldeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAAO4CV2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAAO4CV025I2sqwAAAPEAAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADJAgAAAAA=',
  'base64',
);

type SelfTestItem = {
  format: string;
  status: ParsedIngestion['status'];
  textMatched: boolean;
};

function summarize(parsed: ParsedIngestion): SelfTestItem {
  return {
    format: parsed.format,
    status: parsed.status,
    textMatched: parsed.status === 'ready' && parsed.text.includes(EXPECTED_TEXT),
  };
}

export async function runParserSelfTest(): Promise<{ pdf: SelfTestItem; docx: SelfTestItem }> {
  const adapters = createDefaultIngestionAdapters();
  const [pdf, docx] = await Promise.all([
    parseIngestionWithAdapters('fixture.pdf', PDF_FIXTURE, adapters),
    parseIngestionWithAdapters('fixture.docx', DOCX_FIXTURE, adapters),
  ]);
  return { pdf: summarize(pdf), docx: summarize(docx) };
}

if (require.main === module) {
  void runParserSelfTest().then((result) => {
    if (!result.pdf.textMatched || !result.docx.textMatched) {
      console.error('PARSER_SELF_TEST_FAILED');
      process.exitCode = 1;
      return;
    }
    console.log('PARSER_SELF_TEST_OK pdf=ready docx=ready');
  }).catch(() => {
    console.error('PARSER_SELF_TEST_FAILED');
    process.exitCode = 1;
  });
}
