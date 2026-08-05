package main

import (
	"fmt"
	"os"
	_ "time/tzdata"

	"simfiment/internal/app"
)

func main() {
	if err := app.Run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "simfiment:", err)
		os.Exit(1)
	}
}
