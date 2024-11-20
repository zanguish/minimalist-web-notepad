# Minimalist Web Notepad

This is a minimalist web notepad project inspired by https://github.com/pereorga/minimalist-web-notepad and implemented
in Golang.

## Installation

### Docker

```shell
docker build -t minimalist-web-notepad:latest .

docker run -d --rm -it -p 8888:8888 --name minimalist-web-notepad minimalist-web-notepad:latest
```

## Usage (CLI)

Using the command-line interface you can both save and retrieve notes. Here are some examples using `curl`:

Retrieve a note's content and save it to a local file:

```
curl http://127.0.0.1:8888/test > test.txt
```

Save specific text to a note:

```
curl http://127.0.0.1:8888/test -d 'hello,

welcome to my pad!
'
```

Save the content of a local file (e.g., `/etc/hosts`) to a note:

```
cat /etc/hosts | curl http://127.0.0.1:8888/hosts --data-binary @-
```