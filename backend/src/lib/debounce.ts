// Buffer que agrupa mensagens por paciente com debounce de 4 segundos

interface BufferEntry {
  messages: string[];
  timer: NodeJS.Timeout | null;
}

class DebounceBuffer {
  private buffers = new Map<string, BufferEntry>();
  private readonly DEBOUNCE_MS = 4000; // 4 segundos

  /**
   * Adiciona mensagem ao buffer e dispara callback quando acabar o debounce
   */
  addMessage(
    phone: string,
    message: string,
    onFlush: (messages: string[]) => Promise<void>
  ): void {
    let entry = this.buffers.get(phone);

    // Se já existe buffer, limpa o timer anterior
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }

    // Cria ou atualiza o buffer
    if (!entry) {
      entry = { messages: [], timer: null };
      this.buffers.set(phone, entry);
    }

    entry.messages.push(message);

    // Seta novo timer
    entry.timer = setTimeout(async () => {
      const messages = entry!.messages;
      this.buffers.delete(phone);

      console.log(`[DEBOUNCE] Processando ${messages.length} mensagem(ns) de ${phone}`);

      try {
        await onFlush(messages);
      } catch (error) {
        console.error(`[DEBOUNCE] Erro ao processar mensagens de ${phone}:`, error);
      }
    }, this.DEBOUNCE_MS);
  }

  /**
   * Retorna as mensagens agrupadas para um paciente (para debug)
   */
  getBuffer(phone: string): string[] | null {
    return this.buffers.get(phone)?.messages ?? null;
  }

  /**
   * Limpa todos os buffers (útil para testes)
   */
  clear(): void {
    for (const entry of this.buffers.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
    }
    this.buffers.clear();
  }
}

// Singleton
export const debounceBuffer = new DebounceBuffer();
