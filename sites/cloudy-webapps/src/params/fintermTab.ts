// #1399 Matches only a FinTerm terminal tab (nav/finterm-app.json tabs: the tabs with dashboards), so /<app>/<tab>/<page>/ of another
// section (MY-PM, About, Config) stays with the catch-all. Reads the tiny app-id file: this module is in the client router manifest.
import app from '@cloudy/ui/nav/finterm-app.json';
export const match = (param: string): boolean => (app.tabs as string[]).includes(param);
