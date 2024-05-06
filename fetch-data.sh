#!/usr/bin/env bash

set -euo pipefail

git_url='https://github.com/9oOzv/amq-anilist-tool.git'
tmpdir="$(mktemp -d)"
repodir="$tmpdir/anilist-tool"
target="$(readlink -f "${1:-"media.json"}")"

git_clone() {
    git clone "$git_url" "$repodir"
    cd "$repodir"
}

check_python() {
    if ! command -v "python$1" &>/dev/null; then
        return 1
    fi
    if ! "python$1" -m pip --version &>/dev/null; then
        return 1
    fi
    return 0
}

venv() {
    versions=("3.14" "3.13" "3.12" "3.11" )
    for v in "${versions[@]}"; do
        if check_python "$v"; then
            break
        else
            v=
        fi
    done
    if [ -n "$v" ]; then
        echo "No suitable python found"
        return 1
    fi
    "python$v" -m venv venv
    . venv/bin/activate
    pip install -r requirements.txt
}

git_clone
venv
python anilist-amq-tool.py update_data -d media.json --no-data
cp media.json "$target"

cd /
rm -rf "$tmpdir"
