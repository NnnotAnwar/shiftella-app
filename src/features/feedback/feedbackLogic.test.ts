import { describe, it, expect } from 'vitest';
import { buildFeedbackContext, cleanMessage, feedbackErrorKey, nextStatus, shortUserAgent, FEEDBACK_MAX_LENGTH } from './feedbackLogic';
import { openFeedback, subscribeOpenFeedback } from './feedbackSignal';

describe('buildFeedbackContext', () => {
    it('keeps only the path: query strings and hashes can carry tokens', () => {
        const c = buildFeedbackContext({ pathname: '/reset-password?token=secret#x', language: 'cs', version: '1.13.0', userAgent: 'UA' });
        expect(c).toEqual({ route: '/reset-password', app_version: '1.13.0', language: 'cs', user_agent: 'UA' });
    });

    it('clips long values and turns blanks into null', () => {
        const c = buildFeedbackContext({ pathname: '', language: '  ', version: null, userAgent: 'x'.repeat(900) });
        expect(c.route).toBeNull();
        expect(c.language).toBeNull();
        expect(c.app_version).toBeNull();
        expect(c.user_agent).toHaveLength(400);
    });
});

describe('cleanMessage', () => {
    it('trims, rejects empty, caps at the database limit', () => {
        expect(cleanMessage('  hi  ')).toBe('hi');
        expect(cleanMessage('   \n ')).toBeNull();
        expect(cleanMessage('a'.repeat(FEEDBACK_MAX_LENGTH + 50))).toHaveLength(FEEDBACK_MAX_LENGTH);
    });
});

describe('nextStatus', () => {
    it('cycles new → seen → done → new', () => {
        expect(nextStatus('new')).toBe('seen');
        expect(nextStatus('seen')).toBe('done');
        expect(nextStatus('done')).toBe('new');
    });
});

describe('feedbackErrorKey', () => {
    it('maps the database rate limit, everything else is a generic failure', () => {
        expect(feedbackErrorKey({ message: 'feedback_rate_limited' })).toBe('feedback.rateLimited');
        expect(feedbackErrorKey(new Error('network'))).toBe('feedback.sendFailed');
        expect(feedbackErrorKey(null)).toBe('feedback.sendFailed');
    });
});

describe('shortUserAgent', () => {
    it('names browser and OS (Edge before Chrome, Chrome before Safari)', () => {
        expect(shortUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome 131 · macOS');
        expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge 130 · Windows');
        expect(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')).toBe('Safari 18 · iOS');
        expect(shortUserAgent('Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0')).toBe('Firefox 132 · Android');
        expect(shortUserAgent(null)).toBe('');
    });
});

describe('openFeedback signal', () => {
    it('returns false with no host; delivers options to subscribers', () => {
        expect(openFeedback()).toBe(false);
        const got: unknown[] = [];
        const off = subscribeOpenFeedback((o) => got.push(o));
        expect(openFeedback({ kind: 'bug' })).toBe(true);
        expect(got).toEqual([{ kind: 'bug' }]);
        off();
        expect(openFeedback()).toBe(false);
    });
});
