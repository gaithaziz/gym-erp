export type TicketCategory = 'GENERAL' | 'TECHNICAL' | 'BILLING' | 'SUBSCRIPTION';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportMessage {
    id: string;
    sender_id: string;
    message: string;
    media_url?: string | null;
    media_mime?: string | null;
    media_size_bytes?: number | null;
    created_at: string;
}

export interface SupportTicket {
    id: string;
    subject: string;
    category: TicketCategory;
    status: TicketStatus;
    created_at: string;
    updated_at: string;
}

export interface SupportTicketWithMessages extends SupportTicket {
    messages: SupportMessage[];
}

export interface SupportTicketWithCustomer extends SupportTicket {
    customer_id: string;
    customer?: {
        id: string;
        full_name: string;
        email: string;
        profile_picture_url: string | null;
    };
}

