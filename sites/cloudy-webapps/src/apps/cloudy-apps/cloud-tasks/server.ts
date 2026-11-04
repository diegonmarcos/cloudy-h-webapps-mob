// Cloud Tasks (ac_cloud-tasks) on the web: tasks and calendar over a small committed SAMPLE (the phone syncs the real ones
// from Radicale CalDAV, service calendar-radicale); settings pages are device-only.
import type { AppView } from '$lib/server/nav';

const TASKS = [
  { title: 'Review the fleet backlog', due: 'Today', list: 'Work', done: false },
  { title: 'Renew the domain', due: 'Fri', list: 'Ops', done: false },
  { title: 'Book the dentist', due: 'Next week', list: 'Personal', done: false },
  { title: 'Ship the web mimic', due: 'Yesterday', list: 'Work', done: true },
];
const EVENTS = [
  { title: 'Standup', when: 'Today · 09:00', where: 'Work', notes: 'Daily, 15 min' },
  { title: '1:1 with Ops', when: 'Today · 14:00', where: 'Work', notes: 'Fleet review' },
  { title: 'Dentist', when: 'Tomorrow · 10:30', where: 'Personal', notes: 'Bring the card' },
  { title: 'Deploy freeze', when: 'Thu', where: 'Ops', notes: 'No pushes after 18:00' },
];
export function load(view: AppView) {
  return { section: view.section, page: view.page, tasks: TASKS, events: EVENTS, invites: [{ title: 'Quarterly planning', when: 'Mon · 11:00', where: 'Work', notes: 'from ops@' }], listDetail: view.listDetail };
}
