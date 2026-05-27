import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Автоматически делает пути к ассетам относительными (./assets/...), чтобы dist/index.html запускался двойным кликом на любом ПК
});
