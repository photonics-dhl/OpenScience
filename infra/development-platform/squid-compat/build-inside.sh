#!/usr/bin/env bash
set -euo pipefail
set +x
umask 022

mkdir -p /build/rpmbuild/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS} /build/rpmdb
rpm --install --define '_topdir /build/rpmbuild' --define '_dbpath /build/rpmdb' \
  /inputs/squid-7.2-1.alnx4.src.rpm
cp /instructions/squid-bug5520.patch /build/rpmbuild/SOURCES/
python3 /instructions/prepare-spec.py /build/rpmbuild/SPECS/squid.spec

# Compile/package with the original vendor features, macros, service and config.
# No %check; no squid invocation, network, live config or host filesystem access.
exec rpmbuild -ba --nocheck \
  --define '_topdir /build/rpmbuild' \
  --define 'dist .alnx4' \
  --define '_smp_mflags -j2' \
  /build/rpmbuild/SPECS/squid.spec
