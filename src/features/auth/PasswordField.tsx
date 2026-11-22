import { useState, type KeyboardEvent } from 'react';
import { CheckCircleIcon, CircleIcon, EyeIcon, EyeSlashIcon, LockIcon, WarningIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Input } from '@shared/components/Input';
import { capsLockFrom } from './authFlows';

/**
 * --- PASSWORD FIELD ---
 * The password input of the signed-out pages: show/hide toggle, a Caps Lock
 * warning while focused, and — for new passwords — a live "N+ characters"
 * check under the field (stays visible while typing, unlike a placeholder).
 */
export function PasswordField({
    id,
    value,
    onChange,
    placeholder,
    autoComplete,
    minLength,
    invalid,
    autoFocus,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoComplete: 'current-password' | 'new-password';
    /** When set, shows the live length check under the field. */
    minLength?: number;
    invalid?: boolean;
    autoFocus?: boolean;
}) {
    const t = useTranslation();
    const [show, setShow] = useState(false);
    const [caps, setCaps] = useState(false);
    const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(capsLockFrom(e));
    const met = minLength !== undefined && value.length >= minLength;
    const hintId = `${id}-hint`;

    return (
        <div>
            <Input
                id={id}
                icon={LockIcon}
                type={show ? 'text' : 'password'}
                required
                autoComplete={autoComplete}
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKey}
                onKeyUp={onKey}
                onBlur={() => setCaps(false)}
                placeholder={placeholder ?? '••••••••'}
                invalid={invalid}
                aria-describedby={minLength !== undefined ? hintId : undefined}
                trailing={
                    <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        {show ? <EyeSlashIcon weight="bold" className="w-4 h-4" /> : <EyeIcon weight="bold" className="w-4 h-4" />}
                    </button>
                }
            />
            {(minLength !== undefined || caps) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1">
                    {minLength !== undefined && (
                        <p
                            id={hintId}
                            className={`flex items-center gap-1 text-caption transition-colors ${met ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-soft dark:text-slate-400'}`}
                        >
                            {met ? <CheckCircleIcon weight="fill" className="size-3.5" /> : <CircleIcon weight="bold" className="size-3.5" />}
                            {t('auth.passwordHint', { n: minLength })}
                        </p>
                    )}
                    {caps && (
                        <p role="status" className="flex items-center gap-1 text-caption text-amber-700 dark:text-amber-300">
                            <WarningIcon weight="fill" className="size-3.5" />
                            {t('auth.capsLock')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
