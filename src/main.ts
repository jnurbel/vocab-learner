import { mount } from 'svelte';
import './app/app.css';
import App from './app/App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount point #app not found');
}

export default mount(App, { target });
