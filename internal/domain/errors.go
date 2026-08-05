package domain

import "fmt"

// Error is a safe, typed domain error suitable for mapping to an API response.
type Error struct {
	Code    string
	Message string
	Fields  map[string]string
	Status  int
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// NewError creates a typed domain error.
func NewError(status int, code, message string) *Error {
	return &Error{Code: code, Message: message, Status: status}
}

// ValidationError creates a field-level validation error.
func ValidationError(fields map[string]string) *Error {
	return &Error{Code: "validation_error", Message: "部分欄位無效。", Fields: fields, Status: 422}
}

// WrapInternal avoids leaking an underlying error while retaining it for logs.
type InternalError struct {
	Op  string
	Err error
}

func (e *InternalError) Error() string { return fmt.Sprintf("%s: %v", e.Op, e.Err) }
func (e *InternalError) Unwrap() error { return e.Err }
