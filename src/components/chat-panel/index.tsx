'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  SendHorizontal,
  Loader2,
  Trash2,
  Sparkles,
  Bot,
  User,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useStoreEditor } from '@/lib/store';
import type { ChatMessage, ChatEditOperation } from '@/lib/store-schema';

const SUGGESTIONS = [
  'Change the hero headline',
  'Make the theme darker',
  'Add a testimonials section',
  'Update product prices',
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function summarizeOperations(ops: ChatEditOperation[]): string {
  const counts = new Map<string, number>();
  for (const op of ops) {
    const key = op.type;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of counts) {
    switch (type) {
      case 'update-theme':
        parts.push('Changed theme colors');
        break;
      case 'update-section':
        parts.push(`Updated ${count} section${count > 1 ? 's' : ''}`);
        break;
      case 'add-section':
        parts.push(`Added ${count} section${count > 1 ? 's' : ''}`);
        break;
      case 'remove-section':
        parts.push(`Removed ${count} section${count > 1 ? 's' : ''}`);
        break;
      case 'reorder-sections':
        parts.push('Reordered sections');
        break;
      case 'add-product':
        parts.push(`Added ${count} product${count > 1 ? 's' : ''}`);
        break;
      case 'update-product':
        parts.push(`Updated ${count} product${count > 1 ? 's' : ''}`);
        break;
      case 'remove-product':
        parts.push(`Removed ${count} product${count > 1 ? 's' : ''}`);
        break;
      case 'bulk-update':
        parts.push('Applied bulk update');
        break;
      case 'update-page':
        parts.push(`Updated ${count} page${count > 1 ? 's' : ''}`);
        break;
      default:
        break;
    }
  }

  return parts.length > 0 ? parts.join(' · ') : '';
}

export default function ChatPanel() {
  const { store, chatMessages, addChatMessage, clearChat, applyOperations } =
    useStoreEditor();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || isSending) return;

      setIsSending(true);
      setInput('');

      // Add user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(userMsg);

      try {
        // Send to API with current store and last 20 messages
        const last20 = chatMessages.slice(-20);
        const res = await fetch('/api/store/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            store: store,
            history: last20,
          }),
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();

        // Add assistant message
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message || data.text || 'Done.',
          timestamp: new Date().toISOString(),
          operations: data.operations,
        };
        addChatMessage(assistantMsg);

        // Apply operations if present
        if (data.operations && Array.isArray(data.operations) && data.operations.length > 0) {
          applyOperations(data.operations);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Something went wrong';
        toast.error('Chat error', { description: errorMsg });

        const errorAssistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMsg}. Please try again.`,
          timestamp: new Date().toISOString(),
        };
        addChatMessage(errorAssistantMsg);
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [isSending, chatMessages, store, addChatMessage, applyOperations]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleClear = () => {
    clearChat();
    toast.success('Chat cleared');
  };

  const handleSuggestionClick = (text: string) => {
    handleSend(text);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">AI Assistant</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          onClick={handleClear}
          aria-label="Clear chat"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages or Empty State */}
      <div className="flex-1 overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
              <MessageSquare className="h-7 w-7 text-zinc-500" />
            </div>
            <p className="mb-6 text-center text-sm text-zinc-400">
              Ask me to edit your store
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto scroll-smooth"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#3f3f46 transparent',
            }}
          >
            <div className="flex flex-col gap-3 px-4 py-4">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`flex max-w-[85%] gap-2 ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        msg.role === 'user'
                          ? 'bg-zinc-700 text-zinc-200'
                          : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </div>

                    {/* Bubble */}
                    <div className="flex flex-col gap-1">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'rounded-br-md bg-[#1e1e2e] text-zinc-100'
                            : 'rounded-bl-md bg-[#2a2a3a] text-zinc-200'
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Timestamp + Operations summary */}
                      <div
                        className={`flex items-center gap-2 px-1 ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <span className="text-[10px] text-zinc-600">
                          {formatTime(msg.timestamp)}
                        </span>
                        {msg.role === 'assistant' &&
                          msg.operations &&
                          msg.operations.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                              <Sparkles className="h-2.5 w-2.5" />
                              {summarizeOperations(msg.operations)}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isSending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-[#2a2a3a] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.3s]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe what to change..."
            disabled={isSending}
            className="h-10 border-zinc-800 bg-zinc-900 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
          />
          <Button
            size="icon"
            onClick={() => handleSend(input)}
            disabled={isSending || !input.trim()}
            className="h-10 w-10 shrink-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-none hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-40"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
