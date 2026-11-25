import { z } from 'zod';

/**
 * Shape of `org_analytics(from, to, location)` — see the migration
 * 20261125130000_owner_analytics.sql for how every number is computed.
 * Postgres numerics arrive as JSON numbers inside jsonb.
 */
const num = z.coerce.number();

export const AnalyticsDaySchema = z.object({ day: z.string(), worked: num, planned: num });
export const AnalyticsLocationSchema = z.object({
    location_id: z.string().nullable(),
    name: z.string().nullable(),
    worked: num,
    planned: num,
    cost: num.nullable(),
});
export const AnalyticsMemberSchema = z.object({
    user_id: z.string(),
    name: z.string(),
    worked: num,
    planned: num,
    absence_hours: num,
    on_time: num,
    late_15: num,
    late_60: num,
    no_show: num,
    avg_late_min: num.nullable(),
    cost: num.nullable(),
});
export const AnalyticsAbsenceSchema = z.object({ kind: z.string(), people: num, days: num, hours: num });
export const LatenessSchema = z.object({
    on_time: num,
    late_15: num,
    late_60: num,
    no_show: num,
    avg_late_min: num.nullable(),
});
export const HeatCellSchema = z.object({ dow: num, hour: num, people: num });

export const AnalyticsSchema = z.object({
    from: z.string(),
    to: z.string(),
    location_id: z.string().nullable(),
    can_cost: z.boolean(),
    currency: z.string(),
    totals: z.object({
        worked: num,
        planned: num,
        absence_hours: num,
        cost: num.nullable(),
        planned_cost: num.nullable(),
        uncosted_hours: num.nullable(),
    }),
    days: z.array(AnalyticsDaySchema),
    locations: z.array(AnalyticsLocationSchema),
    members: z.array(AnalyticsMemberSchema),
    absences: z.array(AnalyticsAbsenceSchema),
    lateness: LatenessSchema,
    heatmap: z.array(HeatCellSchema),
});

export type Analytics = z.infer<typeof AnalyticsSchema>;
export type AnalyticsDay = z.infer<typeof AnalyticsDaySchema>;
export type AnalyticsLocation = z.infer<typeof AnalyticsLocationSchema>;
export type AnalyticsMember = z.infer<typeof AnalyticsMemberSchema>;
export type AnalyticsAbsence = z.infer<typeof AnalyticsAbsenceSchema>;
export type Lateness = z.infer<typeof LatenessSchema>;
export type HeatCell = z.infer<typeof HeatCellSchema>;
