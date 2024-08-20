package main

import (
	"embed"
	"fmt"
	"github.com/gin-gonic/gin"
	"html/template"
	"io"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

func shuffleString(s string) string {
	runes := []rune(s)
	rand.NewSource(time.Now().UnixNano())
	rand.Shuffle(len(runes), func(i, j int) {
		runes[i], runes[j] = runes[j], runes[i]
	})
	return string(runes)
}

func fileExists(filename string) bool {
	_, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}
	return err == nil
}

func NoCache(c *gin.Context) {
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Next()
}

//go:embed templates/*
var templates embed.FS

//go:embed favicon.ico
var favicon embed.FS

func main() {
	r := gin.Default()

	tmpl := template.Must(template.ParseFS(templates, "templates/index.html"))
	r.SetHTMLTemplate(tmpl)

	// Disable caching.
	r.Use(NoCache)

	r.StaticFileFS("/favicon.ico", "favicon.ico", http.FS(favicon))

	r.GET("/", Handle)
	r.GET("/:note", Handle)
	r.POST("/:note", Handle)

	httpPort, ok := os.LookupEnv("HTTP_PORT")
	if !ok {
		httpPort = "8888"
	}
	r.Run(fmt.Sprintf(":%s", httpPort))
}

func Handle(c *gin.Context) {
	// Path to the directory to save the notes in, without trailing slash.
	// Should be outside the document root, if possible.
	var savePath = "_tmp"

	os.MkdirAll(savePath, 0777)

	path := savePath + "/" + c.Param("note")
	var (
		content []byte
	)
	if fileExists(path) {
		content, _ = os.ReadFile(path)
	}

	switch c.Request.Method {
	case "GET":
		// If no note name is provided, or if the name is too long, or if it contains invalid characters.
		reg := regexp.MustCompile("/^[a-zA-Z0-9_-]+$/")
		if c.Param("note") == "" || len(c.Param("note")) > 64 || reg.MatchString(c.Param("note")) {
			// Generate a name with 5 random unambiguous characters. Redirect to it.
			c.Redirect(http.StatusFound, shuffleString("234579abcdefghjkmnpqrstwxyz")[:5])
			return
		}

		// Print raw file when explicitly requested, or if the client is curl or wget.
		if _, rawOK := c.GetQuery("raw"); rawOK ||
			strings.Index(strings.ToLower(c.GetHeader("User-Agent")), "curl") == 0 ||
			strings.Index(strings.ToLower(c.GetHeader("User-Agent")), "wget") == 0 {
			if fileExists(path) {
				c.String(http.StatusOK, string(content)+"\n")
			} else {
				c.String(http.StatusNotFound, "HTTP/1.0 404 Not Found")
			}
			return
		}

		c.HTML(http.StatusOK, "index.html", gin.H{
			"note":    c.Param("note"),
			"content": string(content),
		})
	case "POST":
		var (
			input string
		)
		rawData, _ := c.GetRawData()
		c.Request.Body = io.NopCloser(strings.NewReader(string(rawData)))
		if text, ok := c.GetPostForm("text"); ok {
			input = text
		} else {
			input = string(rawData)
		}

		// If provided input is empty, delete file.
		if len(input) == 0 {
			defer os.Remove(path)
		}
		// Update file.
		file, _ := os.Create(path)
		_, _ = file.WriteString(input)
		defer file.Close()

		c.String(http.StatusOK, "ok\n")
	}
}
