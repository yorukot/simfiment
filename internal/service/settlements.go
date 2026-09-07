package service

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"unicode/utf8"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/store"
)

type SettlementInput struct {
	Counterparty string `json:"counterparty"`
	DueOn        string `json:"dueOn,omitempty"`
}

func normalizeSettlement(input *SettlementInput, allowRemove bool, fields map[string]string) *SettlementInput {
	if input == nil {
		return nil
	}
	out := *input
	out.Counterparty = strings.TrimSpace(out.Counterparty)
	if utf8.RuneCountInString(out.Counterparty) > 80 || (out.Counterparty == "" && (!allowRemove || out.DueOn != "")) {
		fields["settlement.counterparty"] = "請填寫對象，最多 80 個字元。"
	}
	if out.DueOn != "" {
		if _, err := domain.ParseDate(out.DueOn); err != nil {
			fields["settlement.dueOn"] = "日期格式必須為 YYYY-MM-DD。"
		}
	}
	return &out
}

func (s *Service) CompleteSettlement(ctx context.Context, id int64, completed bool) (domain.Transaction, error) {
	var out domain.Transaction
	err := database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		st := store.New(tx)
		item, err := st.GetTransaction(ctx, id, true)
		if store.IsNoRows(err) {
			return domain.NewError(http.StatusNotFound, "not_found", "找不到交易。")
		}
		if err != nil {
			return err
		}
		if item.DeletedAt != nil || item.Settlement == nil {
			return domain.NewError(http.StatusConflict, "settlement_unavailable", "此交易無法更新借還款狀態。")
		}
		if err := st.CompleteSettlement(ctx, id, completed, s.clock.Now()); err != nil {
			return err
		}
		out, err = st.GetTransaction(ctx, id, true)
		return err
	})
	if err != nil {
		if _, ok := err.(*domain.Error); ok {
			return out, err
		}
		return out, internal("complete settlement", err)
	}
	return out, nil
}
