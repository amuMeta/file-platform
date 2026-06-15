#!/bin/bash
# gen-secret.sh - 生成 SESSION_SECRET(64 字符 hex)
echo "SESSION_SECRET=$(openssl rand -hex 32)"
