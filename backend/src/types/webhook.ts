// Tipos do webhook UAZAPI (formato real da v2)

export interface UazapiChat {
  phone: string;
  wa_chatid: string;
  wa_isGroup: boolean;
  name?: string;
  lead_name?: string;
}

export interface UazapiMessage {
  text: string;
  type: string;
  messageType: string;
  mediaType: string;
  fromMe: boolean;
  id: string;
  messageid: string;
  messageTimestamp: number;
  chatid: string;
  content?: {
    text?: string;
    URL?: string;
    url?: string;
    mimetype?: string;
  };
}

export interface WebhookPayload {
  EventType: string;
  BaseUrl: string;
  instanceName: string;
  token: string;
  owner: string;
  chat: UazapiChat;
  message: UazapiMessage;
}
