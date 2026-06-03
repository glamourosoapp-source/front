import { z } from "zod";
import { NOTIFICATION_TYPES } from "../constants";
import { paginationSchema } from "./common";

const notificationType = z.enum([
  NOTIFICATION_TYPES.CONVERSATION_HANDOFF,
  NOTIFICATION_TYPES.ORDER_CREATED,
  NOTIFICATION_TYPES.ORDER_STATUS_CHANGED,
  NOTIFICATION_TYPES.CAMPAIGN_COMPLETED,
]);

export const queryNotificationSchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export const notificationEventSchema = z.object({
  type: notificationType,
  notification: z.object({
    id: z.string().uuid(),
    type: notificationType,
    title: z.string(),
    message: z.string().nullable().optional(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    metadata: z.record(z.unknown()).optional(),
    readAt: z.string().nullable().optional(),
    createdAt: z.string(),
  }),
});

export type QueryNotificationInput = z.infer<typeof queryNotificationSchema>;
export type NotificationEventPayload = z.infer<typeof notificationEventSchema>;
