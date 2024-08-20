FROM dockerproxy.cn/golang:alpine AS builder
RUN mkdir /app
ADD . /app/
WORKDIR /app
ENV GO111MODULE=on \
    GOPROXY=https://goproxy.cn,direct
RUN go build -o minimalist-web-notepad .

FROM dockerproxy.cn/alpine
RUN mkdir /app
WORKDIR /app
COPY --from=builder /app/minimalist-web-notepad .
CMD ["./minimalist-web-notepad"]