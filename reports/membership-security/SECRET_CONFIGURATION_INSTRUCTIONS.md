# 阿里云短信密钥配置说明

状态：已被 `SECRET_MANUAL_ENTRY_INSTRUCTIONS.md` 取代，请勿执行本文中的旧版自动探测步骤。2026-08-30 远程只读审计已经确认实际环境文件为 `/home/web1/.env`。

当前仍没有执行生产写入、服务重启、部署、数据库迁移或真实短信发送。

## 已确认与待确认边界

- 本地部署工作流确认应用目录为 `/home/web1`，优先加载 `.env.production`，不存在时回退到 `.env`。
- 当前环境无法解析任务指定的 `ecs-197424` SSH 目标，因此尚未远程确认 `web1.service` 的 `WorkingDirectory`、`EnvironmentFile` 或实际运行用户。
- 不猜测服务器地址，不改 systemd，不新建另一套密钥文件。远程审计完成前，只更新生产机上已经存在且未被 Git 跟踪的 `.env.production` 或 `.env`。
- 真实 AccessKey 不得发到聊天、工单、Git、报告、截图或命令行参数中。

## 1. 在生产机私密终端中确认现有环境文件

使用团队现有的受控入口登录任务指定的生产机，然后执行：

```bash
cd /home/web1

if [ -f .env.production ]; then
  env_file="/home/web1/.env.production"
elif [ -f .env ]; then
  env_file="/home/web1/.env"
else
  echo "STOP: no existing production env file"
  exit 1
fi

env_name="$(basename "$env_file")"
if git ls-files --error-unmatch "$env_name" >/dev/null 2>&1; then
  echo "STOP: production env file is tracked by Git"
  exit 1
fi
if ! git check-ignore -q -- "$env_name"; then
  echo "STOP: production env file is not covered by Git ignore rules"
  exit 1
fi

chmod 600 "$env_file"
stat -c 'ENV_FILE=%n MODE=%a OWNER=%U:%G' "$env_file"
```

期望权限为 `600`。以上命令只显示文件名、权限和属主，不显示任何配置值。

## 2. 无回显、无命令历史地原子写入配置

下面的 Python 程序通过 `getpass` 读取两个凭据；输入不会回显，凭据也不会出现在 shell 历史中。程序只更新五个短信配置键，保留环境文件中的其他配置，并保留原属主。

```bash
umask 077
python3 - <<'PY'
from getpass import getpass
import json
import os
from pathlib import Path
import re
import tempfile

root = Path("/home/web1")
if (root / ".env.production").is_file():
    target = root / ".env.production"
elif (root / ".env").is_file():
    target = root / ".env"
else:
    raise SystemExit("STOP: no existing production env file")
if target.is_symlink():
    raise SystemExit("STOP: production env file must not be a symbolic link")

access_key_id = getpass("ALIBABA_CLOUD_ACCESS_KEY_ID (hidden): ").strip()
access_key_secret = getpass("ALIBABA_CLOUD_ACCESS_KEY_SECRET (hidden): ").strip()
if not access_key_id or not access_key_secret:
    raise SystemExit("STOP: both credentials are required")
if any(c in access_key_id + access_key_secret for c in "\r\n\0"):
    raise SystemExit("STOP: credential contains an invalid control character")

values = {
    "SMS_PROVIDER": "aliyun",
    "SMS_SIGN_NAME": "杭州创始记科技发展",
    "SMS_TEMPLATE_CODE": "SMS_512265107",
    "ALIBABA_CLOUD_ACCESS_KEY_ID": access_key_id,
    "ALIBABA_CLOUD_ACCESS_KEY_SECRET": access_key_secret,
}
key_pattern = re.compile(r"^\s*(?:export\s+)?(" + "|".join(map(re.escape, values)) + r")\s*=")
original_stat = target.stat()
kept = [line for line in target.read_text(encoding="utf-8").splitlines() if not key_pattern.match(line)]
if kept and kept[-1] != "":
    kept.append("")
kept.extend(f"{key}={json.dumps(value, ensure_ascii=False)}" for key, value in values.items())
payload = "\n".join(kept) + "\n"

fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
        fd = -1
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary_name, target)
    os.chmod(target, 0o600)
    if hasattr(os, "chown"):
        os.chown(target, original_stat.st_uid, original_stat.st_gid)
finally:
    if fd >= 0:
        os.close(fd)
    if os.path.exists(temporary_name):
        os.unlink(temporary_name)

print(f"UPDATED_ENV_FILE={target}")
print("UPDATED_KEYS=" + ",".join(values))
print("SECRET_VALUES_PRINTED=NO")
PY
```

写入后只核对键名和权限，不输出值：

```bash
stat -c 'ENV_FILE=%n MODE=%a OWNER=%U:%G' "$env_file"
sed -n -E 's/^(SMS_PROVIDER|SMS_SIGN_NAME|SMS_TEMPLATE_CODE|ALIBABA_CLOUD_ACCESS_KEY_ID|ALIBABA_CLOUD_ACCESS_KEY_SECRET)=.*/\1/p' "$env_file"
```

此时停止，不重启服务，也不要把文件内容或凭据发给 Codex。只需回报：

```text
ALIYUN_ACCESS_KEY_CONFIGURED=YES
PRODUCTION_ENV_FILE_PERMISSION=600
```

## 3. 后续一次性真实短信验收（本轮不要执行）

只有在阿里云短信集成代码通过批准的隔离方式到达测试环境、依赖已按 Node 20 锁文件安装、测试手机号已由负责人私下确认后，才执行一次。手机号通过静默输入进入进程环境，不写入 Git、报告或命令历史。

```bash
cd /home/web1
set -a
. "$env_file"
set +a

read -r -s -p 'ALIYUN_SMS_TEST_PHONE (hidden): ' ALIYUN_SMS_TEST_PHONE
echo
export ALIYUN_SMS_TEST_PHONE
export ALIYUN_SMS_REAL_SEND_CONFIRM='SEND_ONE_TEST_SMS'
npm run sms:test:aliyun-real
unset ALIYUN_SMS_REAL_SEND_CONFIRM ALIYUN_SMS_TEST_PHONE
```

脚本最多发起一次 `SendSms`，只输出掩码手机号和安全状态，不输出验证码、完整手机号、AccessKey、RequestId 或异常堆栈。运行后还需由负责人在手机端及阿里云控制台确认实际到达；若失败，只回报脱敏后的业务错误码。
