import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import * as engine from './game/engine';
import * as data from './game/data';
import { ui } from './game/ui.svelte';

mount(App, { target: document.getElementById('app')! });

// Accès console pour les tests automatisés et le débogage : ajouter ?debug à l'URL.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { bd: { engine, data, ui } });
