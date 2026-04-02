import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    // @huggingface/transformers uses native ONNX runtime — don't bundle it
    noExternal: [],
    external: ['@huggingface/transformers'],
  },
});
