#!/bin/sh
# Python 3.9以上を探して、渡されたスクリプトを実行する。
# Windowsでは python3 がMicrosoft Storeへの案内だけを出すことがあるので、実際に動くかを確かめて選ぶ。
# Pythonが無いときは止める（検査せずに通さない）。
for p in python3 python py; do
  if "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then
    exec "$p" "$@"
  fi
done
echo "BLOCKED: Python 3.9以上が見つかりません。README.md の「開発環境」の手順でPythonを入れてください。" >&2
exit 2
