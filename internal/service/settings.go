package service

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/i18n"
	"simfiment/internal/store"
)

// SettingsUpdate contains optional mutable settings.
type SettingsUpdate struct {
	Theme                    *string `json:"theme"`
	AutomaticLocationEnabled *bool   `json:"automaticLocationEnabled"`
	Timezone                 *string `json:"timezone"`
	Locale                   *string `json:"locale"`
	CurrencyCode             *string `json:"currencyCode"`
	ConfirmTimezoneChange    bool    `json:"confirmTimezoneChange"`
	ConfirmCurrencyChange    bool    `json:"confirmCurrencyChange"`
}

// Settings returns installation settings.
func (s *Service) Settings(ctx context.Context) (domain.Settings, error) {
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return settings, internal("get settings", err)
	}
	return settings, nil
}

// UpdateSettings validates and applies mutable preferences.
func (s *Service) UpdateSettings(ctx context.Context, update SettingsUpdate) (domain.Settings, error) {
	current, err := s.store.GetSettings(ctx)
	if err != nil {
		return current, internal("get settings", err)
	}
	previousExponent := current.CurrencyExponent
	fields := map[string]string{}
	if update.Theme != nil {
		if *update.Theme != "system" && *update.Theme != "light" && *update.Theme != "dark" {
			fields["theme"] = "主題必須是 system、light 或 dark。"
		} else {
			current.Theme = *update.Theme
		}
	}
	if update.AutomaticLocationEnabled != nil {
		current.AutomaticLocationEnable = *update.AutomaticLocationEnabled
	}
	if update.Locale != nil {
		if !i18n.Supported(*update.Locale) {
			fields["locale"] = "語系必須是 zh-TW 或 en。"
		} else {
			current.Locale = *update.Locale
		}
	}
	timezoneChanged := update.Timezone != nil && *update.Timezone != current.Timezone
	if timezoneChanged {
		if _, err := time.LoadLocation(*update.Timezone); err != nil {
			fields["timezone"] = "請選擇有效的 IANA 時區。"
		} else {
			current.Timezone = *update.Timezone
		}
	}
	currencyChanged := false
	if update.CurrencyCode != nil {
		currency, supported := domain.Currency(*update.CurrencyCode)
		if !supported {
			fields["currencyCode"] = "請選擇支援的幣別。"
		} else if currency.Code != current.CurrencyCode {
			currencyChanged = true
			current.CurrencyCode = currency.Code
			current.CurrencyExponent = currency.Exponent
		}
	}
	if len(fields) > 0 {
		return current, domain.ValidationError(fields)
	}
	if timezoneChanged && !update.ConfirmTimezoneChange {
		return current, domain.NewError(http.StatusConflict, "timezone_confirmation_required", "變更時區不會重新分組既有資料，請確認後再儲存。")
	}
	if currencyChanged && !update.ConfirmCurrencyChange {
		return current, domain.NewError(http.StatusConflict, "currency_confirmation_required", "變更幣別會重新解讀所有金額，請確認後再儲存。")
	}
	now := s.clock.Now()
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		if currencyChanged {
			if err := txStore.RewriteCurrency(ctx, current.CurrencyCode, previousExponent,
				current.CurrencyExponent, now); err != nil {
				return err
			}
		}
		return txStore.UpdateSettings(ctx, current.Theme, current.AutomaticLocationEnable,
			current.Timezone, current.Locale, current.CurrencyCode, current.CurrencyExponent, now)
	})
	if errors.Is(err, store.ErrCurrencyWouldZero) {
		return current, domain.ValidationError(map[string]string{
			"currencyCode": "有金額在截斷後會變成零，請先調整這些金額。",
		})
	}
	if errors.Is(err, store.ErrCurrencyOverflow) {
		return current, domain.ValidationError(map[string]string{
			"currencyCode": "有金額在轉換後會超過上限，請先調整這些金額。",
		})
	}
	if err != nil {
		return current, internal("update settings", err)
	}
	return current, nil
}
