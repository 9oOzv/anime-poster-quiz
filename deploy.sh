#!/usr/bin/env bash
set -euo pipefail

service="$(cat <<END
[Unit]
Description=Anime Poster Quiz
After=network.target

[Service]
Type=simple
Environment="DEBUG=1"
WorkingDirectory=$DEPLOY_PATH
ExecStart=/usr/bin/node server.mjs serve -p "$DEPLOY_PORT"
Restart=on-failure

[Install]
WantedBy=default.target
END
)"


create_dir() {
    d="$(dirname "$DEPLOY_PATH")"
    if [ ! -e "$d" ]; then
        mkdir -p "$d"
    fi
}

update() {
    if [ ! -e "$DEPLOY_PATH" ]; then
        git clone "$GIT_URL" "$DEPLOY_PATH"
    fi
    cd "$DEPLOY_PATH"
    git fetch
    git checkout "$GIT_REF"
    npm install
}

stop_service() {
    if systemctl --user is-enabled "$SERVICE_NAME" &> /dev/null; then
        systemctl --user disable --now "$SERVICE_NAME" || true
    fi
}

install_service() {
    local folder="$HOME/.config/systemd/user"
    local unit="$folder/$SERVICE_NAME.service"
    if [ ! -e "$folder" ]; then
        mkdir -p "$folder"
    fi
    printf "%s" "$service" >"$unit"
    chmod 644 "$unit"
    systemctl --user daemon-reload
    systemctl --user enable --now "$SERVICE_NAME"
}

fetch_data() {
    f="media.json"
    if [[ $(find "$f" -mtime -30 2>/dev/null) ]]; then
        echo "Data seems recent. Not updating"
        return 0
    fi
    ./fetch-data.sh "$f"
}

create_dir
update
fetch_data
stop_service
install_service
