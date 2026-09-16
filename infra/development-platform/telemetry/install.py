"""Server-only connector provisioning; consumes secrets internally, never prints them."""
import argparse
import os
from pathlib import Path
import secrets
import stat
import json
import subprocess


def run(args, *, data=None, capture=False):
    return subprocess.run(args, input=data, text=True, check=True,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE)


def database(sql):
    return run(['docker', 'exec', '-i', 'openscience-prod-postgres-1', 'sh', '-c',
                'exec psql -X -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
               data=sql, capture=True).stdout.strip()


def private_path(path, directory=False):
    item = path.lstat()
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    expected_mode = 0o700 if directory else 0o600
    if not expected_type(item.st_mode) or item.st_uid != 0 or stat.S_IMODE(item.st_mode) != expected_mode:
        raise ValueError('Unexpected secret path ownership, type or permissions')


def secret_values(path):
    private_path(path)
    values = {}
    for line in path.read_text().splitlines():
        if '=' not in line:
            raise ValueError('Invalid credential record')
        key, value = line.split('=', 1)
        if key in values:
            raise ValueError('Duplicate credential record')
        values[key] = value
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--confirm', action='store_true', required=True)
    parser.add_argument('--release', required=True)
    args = parser.parse_args()
    if os.name != 'posix' or os.geteuid() != 0:
        raise ValueError('Server root required')
    if len(args.release) != 40 or any(c not in '0123456789abcdef' for c in args.release):
        raise ValueError('Full infrastructure Git revision required')
    os.umask(0o077)
    source = Path(__file__).resolve().parent
    labels = json.loads(run(['docker', 'inspect', '--format', '{{json .Config.Labels}}',
                             'openscience-prod-postgres-1'], capture=True).stdout)
    if labels.get('com.docker.compose.project') != 'openscience-prod' or labels.get('com.docker.compose.service') != 'postgres':
        raise ValueError('Unexpected source database identity')
    # This read prevents provisioning the role/view in a misidentified database.
    identity = database("SELECT current_database() = 'openscience' AND "
                        "(SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' "
                        "AND table_name='audit_logs' AND column_name IN ('id','created_at','action','metadata','request_id'));")
    if identity != 't':
        raise ValueError('Unexpected source database or audit schema')
    config = Path('/etc/openscience-development/telemetry')
    private_path(config.parent, directory=True)
    private_path(config.parent / 'langfuse', directory=True)
    config.mkdir(parents=True, exist_ok=True, mode=0o700)
    private_path(config, directory=True)
    credentials = config / 'runtime.env'
    if not credentials.exists():
        # Save credentials before granting LOGIN, so an interrupted install can
        # resume without rotating a running service's password.
        integration = secret_values(config.parent / 'langfuse/integration.env')
        import re
        if not re.fullmatch(r'pk-lf-[a-f0-9]{32}', integration.get('LANGFUSE_PUBLIC_KEY', '')) or not re.fullmatch(r'sk-lf-[a-f0-9]{64}', integration.get('LANGFUSE_SECRET_KEY', '')):
            raise ValueError('Unexpected Langfuse project credential format')
        password = secrets.token_hex(32)
        text = (f'GATEWAY_AUDIT_DATABASE_URL=postgresql://xgs_gateway_telemetry:{password}'
                '@development-gateway-audit-db:5432/openscience\n'
                f'LANGFUSE_PUBLIC_KEY={integration["LANGFUSE_PUBLIC_KEY"]}\n'
                f'LANGFUSE_SECRET_KEY={integration["LANGFUSE_SECRET_KEY"]}\n')
        with credentials.open('x') as file:
            file.write(text)
    from urllib.parse import urlparse
    values = secret_values(credentials)
    password = urlparse(values['GATEWAY_AUDIT_DATABASE_URL']).password
    if not password or len(password) != 64 or any(c not in '0123456789abcdef' for c in password):
        raise ValueError('Unexpected generated credential format')
    provisioned = config / 'provisioned'
    if provisioned.exists() or provisioned.is_symlink():
        private_path(provisioned)
        previous_release = provisioned.read_text().strip()
        if len(previous_release) != 40 or any(c not in '0123456789abcdef' for c in previous_release):
            raise ValueError('Unexpected provisioning marker; operator reconciliation required')
    existing = database("SELECT count(*) FROM pg_roles WHERE rolname='xgs_gateway_telemetry';")
    if existing == '0':
        if provisioned.exists():
            raise ValueError('Provisioned role missing; operator reconciliation required')
        database((source / 'provision-view.sql').read_text())
    elif not provisioned.exists():
        raise ValueError('Existing role needs operator reconciliation; no grants changed')
    else:
        known_view = database("SELECT EXISTS (SELECT 1 FROM pg_class c "
                              "JOIN pg_namespace n ON n.oid=c.relnamespace "
                              "WHERE n.nspname='xgs_telemetry' AND c.relname='gateway_calls' AND c.relkind='v' "
                              "AND has_table_privilege('xgs_gateway_telemetry', c.oid, 'SELECT') "
                              "AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) "
                              "a WHERE a.grantee=0));")
        if known_view != 't':
            raise ValueError('Existing telemetry view needs operator reconciliation; no view changed')
        # Refresh only our known view, using the same definition as first install.
        # CREATE OR REPLACE preserves its owner/grants; role provisioning stays one-time.
        provision = (source / 'provision-view.sql').read_text()
        start = provision.index('CREATE VIEW xgs_telemetry.gateway_calls ')
        end = provision.index('REVOKE ALL ON xgs_telemetry.gateway_calls FROM PUBLIC;', start)
        view = provision[start:end].replace('CREATE VIEW ', 'CREATE OR REPLACE VIEW ', 1)
        database("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='10s'; "
                 + view + 'COMMIT;')
    database("BEGIN; SET LOCAL statement_timeout='5s'; "
             f"ALTER ROLE xgs_gateway_telemetry LOGIN PASSWORD '{password}'; "
             'GRANT CONNECT ON DATABASE openscience TO xgs_gateway_telemetry; COMMIT;')
    marker = config / f'.provisioned-{secrets.token_hex(8)}'
    with marker.open('x') as output:
        output.write(args.release + '\n')
    marker.replace(provisioned)
    for network in ['openscience-development-telemetry-db', 'openscience-development-telemetry-ingest']:
        found = subprocess.run(['docker', 'network', 'inspect', '--format', '{{.Internal}}', network],
                               text=True, capture_output=True)
        if found.returncode:
            run(['docker', 'network', 'create', '--internal', network])
        elif found.stdout.strip() != 'true':
            raise ValueError('Existing telemetry network must be internal')
    attached = run(['docker', 'inspect', '--format', '{{json .NetworkSettings.Networks}}',
                    'openscience-prod-postgres-1'], capture=True).stdout
    if 'openscience-development-telemetry-db' not in json.loads(attached):
        run(['docker', 'network', 'connect', '--alias', 'development-gateway-audit-db',
             'openscience-development-telemetry-db', 'openscience-prod-postgres-1'])
    state = Path('/opt/openscience-development/telemetry/state')
    private_path(state.parent.parent, directory=True)
    state.parent.mkdir(exist_ok=True, mode=0o700)
    private_path(state.parent, directory=True)
    if not state.exists() and not state.is_symlink():
        state.mkdir(mode=0o700)
        os.chown(state, 1000, 1000)
    state_info = state.lstat()
    if not stat.S_ISDIR(state_info.st_mode) or (state_info.st_uid, state_info.st_gid, stat.S_IMODE(state_info.st_mode)) != (1000, 1000, 0o700):
        raise ValueError('Unexpected connector state directory')
    log = config / f'install-{args.release}.log'
    with log.open('a') as output:
        subprocess.run(['with-proxy', 'docker', 'build', '--network', 'host', '--build-arg', 'HTTP_PROXY',
                        '--build-arg', 'HTTPS_PROXY', '--pull=false', '-t',
                        f'openscience-gateway-audit-telemetry:{args.release}', str(source)],
                       check=True, stdout=output, stderr=output)
        environment = {**os.environ, 'TELEMETRY_RELEASE': args.release}
        subprocess.run(['docker', 'compose', '--env-file', '/dev/null', '-f', str(source / 'compose.yaml'),
                        'up', '-d', '--no-build'], env=environment, check=True, stdout=output, stderr=output)
    print('Connector started; source application unchanged. Installation log retained privately.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Subprocess exceptions can contain SQL/password arguments or private logs.
        print('Connector installation stopped; private state retained for operator reconciliation.', flush=True)
        raise SystemExit(1)
