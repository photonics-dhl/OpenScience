# syntax=docker/dockerfile:1
# BASE_IMAGE is the resolved digest of the official Alibaba Cloud Linux 4 image.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

COPY squid-7.2-1.alnx4.src.rpm /inputs/squid-7.2-1.alnx4.src.rpm
RUN chmod 0644 /inputs/* \
    && dnf -y --setopt=install_weak_deps=False install rpm-build system-rpm-config dnf-plugins-core patch python3 cpio \
    && dnf -y --setopt=install_weak_deps=False --enablerepo=alinux4-devel \
       builddep /inputs/squid-7.2-1.alnx4.src.rpm

COPY squid-bug5520.patch prepare-spec.py build-inside.sh /instructions/
RUN chmod 0644 /instructions/*
USER 1000:1000
WORKDIR /build
ENTRYPOINT ["/bin/bash", "/instructions/build-inside.sh"]
