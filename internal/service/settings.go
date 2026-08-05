package service

import (
	"context"
	"net/http"
	"time"

	"simfiment/internal/domain"
)

// SettingsUpdate contains optional mutable settings.
type SettingsUpdate struct {
	Theme                    *string `json:"theme"`
	AutomaticLocationEnabled *bool   `json:"automaticLocationEnabled"`
	Timezone                 *string `json:"timezone"`
	Locale                   *string `json:"locale"`
	ConfirmTimezoneChange    bool    `json:"confirmTimezoneChange"`
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
		if *update.Locale != "zh-TW" {
			fields["locale"] = "MVP 僅支援繁體中文（zh-TW）。"
		} else {
			current.Locale = *update.Locale
		}
	}
	if update.Timezone != nil && *update.Timezone != current.Timezone {
		if _, err := time.LoadLocation(*update.Timezone); err != nil {
			fields["timezone"] = "請選擇有效的 IANA 時區。"
		} else if !update.ConfirmTimezoneChange {
			return current, domain.NewError(http.StatusConflict, "timezone_confirmation_required", "變更時區不會重新分組既有資料，請確認後再儲存。")
		} else {
			current.Timezone = *update.Timezone
		}
	}
	if len(fields) > 0 {
		return current, domain.ValidationError(fields)
	}
	if err := s.store.UpdateSettings(ctx, current.Theme, current.AutomaticLocationEnable,
		current.Timezone, current.Locale, s.clock.Now()); err != nil {
		return current, internal("update settings", err)
	}
	return current, nil
}
