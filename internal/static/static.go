package static

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed dist
var assets embed.FS

// Validate confirms that a production frontend build, including hashed assets,
// was embedded into the executable.
func Validate() error {
	if _, err := fs.Stat(assets, "dist/index.html"); err != nil {
		return fmt.Errorf("embedded frontend index is missing: %w", err)
	}
	entries, err := fs.ReadDir(assets, "dist/assets")
	if err != nil {
		return fmt.Errorf("embedded frontend assets are missing: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			return nil
		}
	}
	return fmt.Errorf("embedded frontend assets directory is empty")
}

// Handler serves immutable Vite assets and falls back to the SPA for frontend routes.
func Handler() http.Handler {
	root, err := fs.Sub(assets, "dist")
	if err != nil {
		panic(err)
	}
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(r.URL.Path)
		if clean == "." {
			clean = "/"
		}
		if clean == "/manifest.webmanifest" {
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Content-Type", "application/manifest+json")
			files.ServeHTTP(w, r)
			return
		}
		if clean == "/sw.js" || clean == "/registerSW.js" {
			w.Header().Set("Cache-Control", "no-cache")
			files.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			files.ServeHTTP(w, r)
			return
		}
		if info, statErr := fs.Stat(root, strings.TrimPrefix(clean, "/")); statErr == nil && !info.IsDir() {
			w.Header().Set("Cache-Control", "public, max-age=86400")
			files.ServeHTTP(w, r)
			return
		}
		if clean == "/" || knownFrontendRoute(clean) {
			w.Header().Set("Cache-Control", "no-cache")
			r.URL.Path = "/"
			files.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})
}

func knownFrontendRoute(value string) bool {
	prefixes := []string{"/setup", "/login", "/today", "/day/", "/month", "/recurring",
		"/settings", "/transactions/"}
	for _, prefix := range prefixes {
		if value == prefix || strings.HasPrefix(value, prefix) {
			return true
		}
	}
	return false
}
