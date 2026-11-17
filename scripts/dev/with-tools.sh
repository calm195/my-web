#!/bin/sh
set -eu
# 项目工具和缓存优先，不修改调用者的全局配置。
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$project_root/var/toolchain/node/bin:$project_root/var/toolchain/go/bin:$project_root/var/toolchain/caddy:$project_root/var/toolchain/bin:$PATH"
export GOPATH="$project_root/var/cache/go"
export GOCACHE="$project_root/var/cache/go-build"
export GOTOOLCHAIN=local
exec "$@"
