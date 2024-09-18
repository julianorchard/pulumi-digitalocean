#!/usr/bin/env sh

set -euf

user="julian"

apt-get update
apt-get upgrade -y

# Add user
! id "${user}" >/dev/null 2>&1 \
    && useradd -m -p "1234" -s /bin/bash "${user}"
# Make user a sudoer
usermod -aG sudo "${user}"
# Add line to SSH config if not already there
! grep -q "PermitRootLogin no" /etc/ssh/sshd_config \
    && echo "PermitRootLogin no" >> /etc/ssh/sshd_config

# Firewalling
ufw allow OpenSSH
ufw enable

# Fail2Ban
apt install fail2ban
systemctl enable fail2ban
