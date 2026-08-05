package service

import (
	"strings"
	"testing"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	params := passwordParameters{memory: 19_456, iterations: 2, parallelism: 1, saltLength: 16, keyLength: 32}
	encoded, err := hashPassword("這是一個夠長的 測試密碼 123", params)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(encoded, "$argon2id$") {
		t.Fatalf("hash is not Argon2id: %s", encoded)
	}
	valid, err := verifyPassword("這是一個夠長的 測試密碼 123", encoded)
	if err != nil || !valid {
		t.Fatalf("valid password rejected: valid=%v err=%v", valid, err)
	}
	valid, err = verifyPassword("這是一個夠長的 測試密碼 124", encoded)
	if err != nil || valid {
		t.Fatalf("wrong password result: valid=%v err=%v", valid, err)
	}
}

func TestPasswordValidationPreservesWhitespace(t *testing.T) {
	if err := validatePassword("            "); err != nil {
		t.Fatalf("twelve spaces are accepted by the explicit policy: %v", err)
	}
	if err := validatePassword("short"); err == nil {
		t.Fatal("short password was accepted")
	}
}

func TestPasswordNeedsRehash(t *testing.T) {
	oldParams := passwordParameters{memory: 19_456, iterations: 2, parallelism: 1, saltLength: 16, keyLength: 32}
	encoded, err := hashPassword("這是一個夠長的 測試密碼 123", oldParams)
	if err != nil {
		t.Fatal(err)
	}
	needs, err := passwordNeedsRehash(encoded, oldParams)
	if err != nil || needs {
		t.Fatalf("current hash needs rehash: needs=%v err=%v", needs, err)
	}
	upgraded := oldParams
	upgraded.iterations++
	needs, err = passwordNeedsRehash(encoded, upgraded)
	if err != nil || !needs {
		t.Fatalf("outdated hash was not detected: needs=%v err=%v", needs, err)
	}
}
