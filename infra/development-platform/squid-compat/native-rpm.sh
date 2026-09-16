#!/usr/bin/env bash
# Reviewed native package upgrade/rollback only. No compiler installation,
# new unit, proxy config edit, connectivity probe, or test invocation.
set -euo pipefail
set +x
umask 077

[[ $(uname -s) == Linux && $EUID == 0 ]] || { printf 'Run as root on the server.\n' >&2; exit 64; }
compat_release=${SQUID_COMPAT_RELEASE:?Set the same infrastructure revision used for build.sh}
[[ $compat_release =~ ^[a-f0-9]{40}$ ]] || exit 64
compat_root=/opt/openscience-development/squid-compat/$compat_release
vendor_rpm=$compat_root/inputs/squid-7.2-1.alnx4.x86_64.rpm
candidate_rpm=$compat_root/work/rpmbuild/RPMS/x86_64/squid-7.2-1.alnx4.openscience.1.x86_64.rpm
snapshot=$compat_root/before-install
original=7:7.2-1.alnx4.x86_64
candidate=7:7.2-1.alnx4.openscience.1.x86_64

package_identity() { rpm -q --queryformat '%{EPOCHNUM}:%{VERSION}-%{RELEASE}.%{ARCH}' squid; }
restore_files() { tar -xpf "$snapshot/config-and-unit.tar" -C /; }
restore_original() {
  # --replacepkgs also repairs a failed upgrade whose rpmdb still names original.
  rpm -U --oldpackage --replacepkgs --nopostun "$vendor_rpm"
  restore_files
  systemctl daemon-reload
  systemctl restart squid
}

case "${1:-}" in
  apply)
    [[ $# == 1 ]] || exit 64
    # Prevent overwriting an operator's unrelated later package upgrade. rpm's
    # normal downgrade checks alone cannot protect an explicit rollback command.
    [[ $(package_identity) == "$original" ]] || { printf 'Expected the recorded original Squid RPM.\n' >&2; exit 1; }
    [[ -f $vendor_rpm && -f $candidate_rpm && ! -e $snapshot ]] || { printf 'Require both RPMs and a new installation snapshot path.\n' >&2; exit 1; }
    install -d -m 0700 "$snapshot"
    preserve_paths=(etc/squid/squid.conf etc/sysconfig/squid usr/lib/systemd/system/squid.service)
    if [[ -e /etc/systemd/system/squid.service.d ]]; then preserve_paths+=(etc/systemd/system/squid.service.d); fi
    tar -cpf "$snapshot/config-and-unit.tar" -C / "${preserve_paths[@]}"
    printf '%s\n' "$original" > "$snapshot/package.txt"

    # Vendor %postun has an automatic restart. Defer just that scriptlet until
    # the same configuration and unit bytes are restored, then restart once.
    if ! rpm -U --nopostun "$candidate_rpm"; then
      restore_original
      printf 'RPM upgrade failed; original package and proxy start restored.\n' >&2
      exit 1
    fi
    if ! restore_files || ! systemctl daemon-reload || ! systemctl restart squid; then
      restore_original
      printf 'Proxy restart failed; original package and proxy start restored.\n' >&2
      exit 1
    fi
    printf 'Native Squid compatibility RPM installed; existing unit/config restored and service restart completed.\n'
    ;;
  rollback)
    [[ $# == 1 ]] || exit 64
    [[ $(package_identity) == "$candidate" ]] || { printf 'Rollback only applies to this exact compatibility RPM.\n' >&2; exit 1; }
    [[ -f $vendor_rpm && -f $snapshot/config-and-unit.tar ]] || exit 1
    restore_original
    printf 'Original vendor Squid RPM and saved configuration/unit restored.\n'
    ;;
  *) printf 'Usage: native-rpm.sh apply|rollback\n' >&2; exit 64 ;;
esac
