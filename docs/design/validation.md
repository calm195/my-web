# 详细设计验证记录

日期：2026-11-15。验证对象是数据库迁移、OpenAPI 与文档，使用临时内存数据库及虚构数据，不访问生产数据库或真实内容仓库。

## 1 可重复运行

从项目根目录执行，在独立环境安装仅用于设计验证的 Python 工具：

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/design-requirements.txt
.venv/bin/python scripts/render_design_references.py
.venv/bin/python scripts/validate_design.py
```

字段字典来自迁移和渲染脚本中的中文说明；API 操作目录来自 OpenAPI。修改 SQL 或合同后重新生成参考表，不手工维护一份容易漂移的接口清单。

## 2 已执行范围

| 项目 | 环境与结果 |
| --- | --- |
| SQLite | Python sqlite3 引擎 3.54.0，内存空库执行建表脚本；32 张业务表，外键检查为空，integrity_check 为 ok |
| OpenAPI | openapi-spec-validator 0.7.2，OpenAPI 3.1.1 结构校验通过 |
| 请求样例 | jsonschema 4.25.1；11 个正反例，包括不完整修改稿、禁止伪造站主、缺失 generation、类型不符与非法冲突意图 |
| 自动检查 | 33 个 unittest 用例，涵盖合同、公开字段隔离、鉴权标记、链接和数据库约束，全部通过 |
| 字段参考 | 自动生成 32 表字典、58 操作目录，列类型/外键/索引取自执行后的 SQLite schema |

用例验证：跨对象版本指针在提交时被拒绝；保存修改稿不改公开标题；CAS 失败与 outbox 失败回滚；回收站不能公开且恢复仍不公开；历史路由占用；一个分类；历史/同步快照的资源引用保护；邮箱不在公开投影；根隐藏与回复自身隐藏；跨线程回复拒绝；评论与邮箱级联；删除后 tombstone/任务保留；任务租约及幂等唯一性。

## 3 验证边界

- 当前 SQL 可执行，但尚未用生产 Go 驱动或 Goose 命令运行；连接池、事务模式、WAL 参数和驱动实际版本需在工程初始化后验证。
- SQLite 设计测试验证数据库能表达的约束；kind 子表一致、资源真实存在、generation 递增、tombstone 拦截导入等服务层规则尚未实现。
- OpenAPI 和 JSON Schema 通过不表示真实 API 已可用；本轮未运行 Go handler、Nuxt/Vue 构建、Cookie/CSRF 集成或真实 HTTP 联调。
- 未执行真实 Git 并发/中断恢复、图片解码任务、备份恢复、容量或线上性能测试。
- 只新增和修订设计文件及验证脚本；没有创建远程仓库、推送代码或部署生产应用。

本机临时验证环境不改变选定的 Node/Go 生产工具链。接口工具导入和 TypeScript 类型生成在脚手架阶段继续执行，不把接口结构校验当作全部客户端兼容性验收。
