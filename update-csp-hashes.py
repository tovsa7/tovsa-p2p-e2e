#!/usr/bin/env python3
"""
Пересчитывает SHA256 хеши inline скриптов в index.html
и обновляет Content-Security-Policy.
Запускается автоматически в deploy.yml после любых изменений файла.
"""
import re, hashlib, base64

with open('index.html', encoding='utf-8') as f:
    html = f.read()

# Находим все inline скрипты (без src=)
inline = []
for attrs, content in re.findall(r'<script([^>]*)>(.*?)</script>', html, re.DOTALL):
    if 'src=' not in attrs and content.strip():
        h = hashlib.sha256(content.encode('utf-8')).digest()
        inline.append(f"'sha256-{base64.b64encode(h).decode()}'")

if not inline:
    print("No inline scripts found")
    exit(1)

hashes = ' '.join(inline)
print(f"Computed {len(inline)} hashes")

# Обновляем script-src в CSP
html_new = re.sub(
    r"script-src 'self'[^;]+;",
    f"script-src 'self' {hashes} https://cdnjs.cloudflare.com;",
    html
)

if html_new == html:
    print("WARNING: CSP not updated - pattern not found")
    exit(1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_new)

print("CSP updated successfully")
