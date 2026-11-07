import { mount } from 'svelte';
import './ui/theme.css';
import './app/app.css';
import './ui/components.css';
import App from './app/App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount point #app not found');
}

export default mount(App, { target });
