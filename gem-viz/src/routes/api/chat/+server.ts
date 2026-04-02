/**
 * Gembot Chat API - Streaming Edition
 *
 * Handles chat messages and tool calls via OpenRouter (Claude Sonnet 4)
 * Streams responses back via Server-Sent Events for snappy UX
 */

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Get API key at runtime
const getOpenRouterKey = () => env.OPENROUTER_API_KEY || '';

// Import extracted modules
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOLS, type CartItem } from './tools';
import { executeTool } from './execute-tool';

// LLM provider config
const OPENROUTER_URL = env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
const APP_SITE_URL = env.PUBLIC_SITE_URL || 'https://gem-viz.fly.dev';

// Model options
const MODEL = 'anthropic/claude-sonnet-4'; // Main orchestrator

/**
 * Stream SSE events to the client
 */
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const send = (event: string, data: unknown) => {
    if (isClosed) return; // Don't send to closed stream
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    } catch (err) {
      console.error('SSE send error:', err);
    }
  };

  const close = () => {
    if (isClosed) return; // Prevent double close
    isClosed = true;
    try {
      controller.close();
    } catch (err) {
      console.error('SSE close error:', err);
    }
  };

  return { stream, send, close };
}

/**
 * Build cart context string for system prompt
 */
function buildCartContext(cart: CartItem[] | undefined): string {
  if (cart && cart.length > 0) {
    const assetItems = cart.filter((i) => i.type === 'asset');
    const entityItems = cart.filter((i) => i.type === 'entity');
    let context = `\n\n## User's Investigation Cart (${cart.length} items)\nThe user has saved these items for investigation:\n`;
    if (assetItems.length > 0) {
      context += `\nAssets (${assetItems.length}):\n${assetItems.map((i) => `- ${i.name} (${i.id})${i.tracker ? ` [${i.tracker}]` : ''}`).join('\n')}`;
    }
    if (entityItems.length > 0) {
      context += `\nEntities (${entityItems.length}):\n${entityItems.map((i) => `- ${i.name} (${i.id})`).join('\n')}`;
    }
    context +=
      "\n\nYou can use add_to_cart, remove_from_cart, or clear_cart to modify this list. Use get_investigation_cart if the user asks what's in their cart.";
    return context;
  }
  return "\n\n## User's Investigation Cart\nThe cart is currently empty. Use add_to_cart to add items when the user wants to save assets or entities for investigation.";
}

/**
 * Process tool calls and return results
 */
async function processToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  cart: CartItem[] | undefined,
  send: (_event: string, _data: unknown) => void
) {
  const toolCallResults: Array<{ tool: string; args: unknown; result: unknown }> = [];

  const toolResults = await Promise.all(
    toolCalls.map(async (toolCall) => {
      let args: Record<string, unknown> = {};
      try {
        args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
      } catch (parseErr) {
        console.error('Failed to parse tool arguments:', toolCall.function.arguments, parseErr);
      }

      // Stream tool start event
      send('tool_start', {
        tool: toolCall.function.name,
        args,
        id: toolCall.id,
      });

      const result = await executeTool(toolCall.function.name, args, cart);

      // Stream tool result event
      const toolResult = {
        tool: toolCall.function.name,
        args,
        result: result.data || result.error,
      };
      send('tool_result', toolResult);
      toolCallResults.push(toolResult);

      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      };
    })
  );

  return { toolResults, toolCallResults };
}

/**
 * Stream final response text
 */
async function streamFinalResponse(
  conversationHistory: unknown[],
  send: (_event: string, _data: unknown) => void,
  toolCallResults: Array<{ tool: string; args: unknown; result: unknown }>
) {
  send('status', { stage: 'writing', message: 'Writing response...' });

  // Abort if streaming takes too long (30s)
  const abortController = new AbortController();
  const streamTimeout = setTimeout(() => abortController.abort(), 30000);

  let streamResponse: Response;
  try {
    streamResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getOpenRouterKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_SITE_URL,
        'X-Title': 'GEM Gembot',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: conversationHistory,
        tools: TOOLS,
        tool_choice: 'none', // Force text response, no more tool calls
        stream: true,
        max_tokens: 4096,
      }),
      signal: abortController.signal,
    });
  } catch (fetchErr) {
    clearTimeout(streamTimeout);
    console.error('Final streaming fetch failed:', fetchErr);
    send('done', {
      message:
        'I gathered the information above but had trouble generating a summary. Please review the results.',
      toolCalls: toolCallResults,
      usage: null,
    });
    return;
  }

  if (!streamResponse.ok || !streamResponse.body) {
    clearTimeout(streamTimeout);
    console.error('Final streaming request failed:', streamResponse.status);
    send('done', {
      message:
        'I gathered the information above but had trouble generating a summary. Please review the results.',
      toolCalls: toolCallResults,
      usage: null,
    });
    return;
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine === 'data: [DONE]') continue;
        if (!trimmedLine.startsWith('data: ')) continue;

        const jsonStr = trimmedLine.slice(6);
        if (!jsonStr) continue;

        try {
          const json = JSON.parse(jsonStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            send('text_delta', { content: delta });
          }
        } catch {
          // Ignore parse errors - might be partial chunk
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
      const jsonStr = buffer.trim().slice(6);
      if (jsonStr) {
        try {
          const json = JSON.parse(jsonStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            send('text_delta', { content: delta });
          }
        } catch {
          // Final chunk parse error, ignore
        }
      }
    }
  } catch (err) {
    console.error('Stream reading error:', err);
  } finally {
    clearTimeout(streamTimeout);
  }

  // If we got no content, provide a fallback
  if (!fullContent.trim()) {
    console.warn('Empty response from final streaming request');
    fullContent =
      'I found the information above but encountered an issue generating a summary. Please review the tool results.';
  }

  send('done', {
    message: fullContent,
    toolCalls: toolCallResults,
    usage: null,
  });
}

export const POST: RequestHandler = async ({ request }) => {
  if (!getOpenRouterKey()) {
    return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, cart } = await request.json();
    const { stream, send, close } = createSSEStream();

    // Process in background, streaming events
    (async () => {
      try {
        const cartContext = buildCartContext(cart);
        const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT + cartContext }, ...messages];

        // Signal we're starting
        send('status', { stage: 'thinking', message: 'Processing your request...' });

        // Initial API call
        let response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': APP_SITE_URL,
            'X-Title': 'GEM Gembot',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: apiMessages,
            tools: TOOLS,
            tool_choice: 'auto',
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          send('error', { message: `AI error: ${response.status}` });
          close();
          return;
        }

        let result = await response.json();
        let assistantMessage = result.choices[0].message;

        // Handle tool calls in a loop (for multi-step reasoning)
        let allToolCallResults: Array<{ tool: string; args: unknown; result: unknown }> = [];
        let iterations = 0;
        const MAX_ITERATIONS = 5;

        // Maintain running conversation history through tool loop
        let conversationHistory = [...apiMessages];

        while (assistantMessage.tool_calls && iterations < MAX_ITERATIONS) {
          iterations++;
          send('status', {
            stage: 'tools',
            iteration: iterations,
            message: `Running tools (step ${iterations})...`,
          });

          const { toolResults, toolCallResults } = await processToolCalls(
            assistantMessage.tool_calls,
            cart,
            send
          );
          allToolCallResults = allToolCallResults.concat(toolCallResults);

          // Add this iteration's messages to the running history
          conversationHistory.push(assistantMessage);
          conversationHistory.push(...toolResults);

          send('status', { stage: 'thinking', message: 'Analyzing results...' });

          response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${getOpenRouterKey()}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': APP_SITE_URL,
              'X-Title': 'GEM Gembot',
            },
            body: JSON.stringify({
              model: MODEL,
              messages: conversationHistory,
              tools: TOOLS,
              tool_choice: 'auto',
              max_tokens: 4096,
            }),
          });

          if (!response.ok) {
            send('error', { message: 'AI continuation error' });
            break;
          }

          result = await response.json();
          if (!result.choices?.[0]?.message) {
            break;
          }
          assistantMessage = result.choices[0].message;
        }

        // If we have content already (no tool calls on last iteration), stream it
        if (assistantMessage?.content && assistantMessage.content.trim()) {
          send('status', { stage: 'writing', message: 'Writing response...' });

          // Stream the text we already have
          const text = assistantMessage.content;
          const chunkSize = 15;
          for (let i = 0; i < text.length; i += chunkSize) {
            send('text_delta', { content: text.slice(i, i + chunkSize) });
            await new Promise((r) => setTimeout(r, 5));
          }

          send('done', {
            message: assistantMessage.content,
            toolCalls: allToolCallResults,
            usage: result?.usage,
          });
        } else if (allToolCallResults.length > 0) {
          // Tools were called but no final response yet - make a streaming request
          await streamFinalResponse(conversationHistory, send, allToolCallResults);
        } else {
          // No tools, no content - something went wrong
          send('done', {
            message: assistantMessage?.content || 'No response generated',
            toolCalls: [],
            usage: result?.usage,
          });
        }

        close();
      } catch (err) {
        console.error('Stream error:', err);
        send('error', { message: 'Internal error processing request' });
        close();
      }
    })();

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
