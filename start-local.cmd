@echo off
cd /d "C:\Users\Dell\Desktop\nft?????"
set HTTPS_PROXY=http://127.0.0.1:7897
set HTTP_PROXY=http://127.0.0.1:7897
node server/index.js > "C:\Users\Dell\Desktop\nft?????\server-local.log" 2> "C:\Users\Dell\Desktop\nft?????\server-local.err.log"
