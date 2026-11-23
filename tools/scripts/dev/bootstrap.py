#!/usr/bin/env python3
"""按已校验摘要安装项目私有工具链，不修改全局 Node、Go 或 pnpm。"""
import base64
import concurrent.futures
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'var/toolchain'


def install(name, artifact, version):
    """下载后先核对摘要，再安全解包；失败不会覆盖已有可用工具。"""
    # 同一工具只允许一个安装者；独立工具仍可并行下载，锁文件不是完成标记。
    with os.fdopen(os.open(DEST / ('.' + name + '.lock'), os.O_CREAT | os.O_RDWR, 0o600), 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        install_locked(name, artifact, version)


def install_locked(name, artifact, version):
    """在独占锁内恢复中断更新，再替换已完成验证的目录。"""
    target = DEST / name
    previous = DEST / ('.' + name + '.previous')
    if target.is_symlink() or previous.is_symlink():
        raise ValueError('工具目录不能是符号链接')
    if previous.exists():
        if not target.exists():
            previous.rename(target)
        elif (target / '.version').is_file():
            shutil.rmtree(previous)
        else:
            raise ValueError('工具更新状态不完整，请保留 previous 目录并检查')
    identity = version + '\n' + artifact.get('sha256', artifact.get('integrity', ''))
    if (target / '.version').exists() and (target / '.version').read_text() == identity:
        print(f'{name} {version} 已就绪', flush=True)
        return
    with tempfile.TemporaryDirectory(prefix=name + '-', dir=DEST) as temporary:
        temporary = Path(temporary)
        archive = temporary / 'archive.tar.gz'
        with urllib.request.urlopen(artifact['url'], timeout=120) as source, archive.open('wb') as out:
            shutil.copyfileobj(source, out)
        raw = archive.read_bytes()
        if 'sha256' in artifact:
            if hashlib.sha256(raw).hexdigest() != artifact['sha256']:
                raise ValueError('发行物 SHA-256 不符')
        else:
            algorithm, expected = artifact['integrity'].split('-', 1)
            if base64.b64encode(hashlib.new(algorithm, raw).digest()).decode() != expected:
                raise ValueError('发行物 SRI 不符')
        unpacked = temporary / 'unpacked'
        unpacked.mkdir()
        with tarfile.open(archive) as source:
            for member in source:
                parts = Path(member.name).parts[artifact['strip']:]
                if not parts:
                    continue
                output = unpacked.joinpath(*parts)
                if not output.resolve().is_relative_to(unpacked.resolve()):
                    raise ValueError('归档路径越界')
                output.parent.mkdir(parents=True, exist_ok=True)
                if member.isdir():
                    output.mkdir(exist_ok=True)
                elif member.issym():
                    if not (output.parent / member.linkname).resolve().is_relative_to(unpacked.resolve()):
                        raise ValueError('归档链接越界')
                    output.symlink_to(member.linkname)
                elif member.isfile():
                    with source.extractfile(member) as contents, output.open('wb') as out:
                        shutil.copyfileobj(contents, out)
                    output.chmod(member.mode & 0o777)
                else:
                    raise ValueError('归档包含不支持的文件类型')
        (unpacked / '.version').write_text(identity)
        if target.exists():
            target.rename(previous)
        try:
            unpacked.rename(target)
        except BaseException:
            # 目录切换失败立即恢复；进程被强杀时，下一次持锁安装先恢复 previous。
            if previous.exists() and not target.exists():
                previous.rename(target)
            raise
        if previous.exists():
            shutil.rmtree(previous)
    print(f'{name} {version} 安装完成', flush=True)


def main():
    """只选择明确锁定的平台，未验证的平台不能偷偷换版本。"""
    manifest = json.loads((ROOT / 'tools/toolchain.json').read_text())
    machine = {'aarch64': 'arm64', 'x86_64': 'x64'}.get(platform.machine(), platform.machine())
    key = platform.system().lower() + '-' + machine
    if key not in manifest['platforms']:
        raise SystemExit(f'尚未锁定平台 {key}，请先补充官方发行物摘要')
    if not DEST.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError('工具链目录越出项目范围')
    DEST.mkdir(parents=True, exist_ok=True)
    artifacts = manifest['platforms'][key]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(install, name, item, manifest[name]) for name, item in artifacts.items()]
        for future in futures:
            future.result()
    (DEST / 'bin').mkdir(exist_ok=True)
    wrapper = DEST / 'bin/pnpm'
    # 路径从脚本位置推导，项目移动后仍可运行；不经过全局 Corepack shim。
    wrapper.write_text('#!/bin/sh\nbase=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec "$base/pnpm/pnpm" "$@"\n')
    wrapper.chmod(0o755)


if __name__ == '__main__':
    main()
