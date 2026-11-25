/**
 * LWH Dock Appointments — email sender + shared calendar sync (Google Apps Script).
 *
 * The same file is pasted into TWO Apps Script projects:
 *
 *   A) EMAIL  — project owned by tjennings@logistics-warehouse.com (emails come from this account)
 *               Run setup() once.  Every minute it sends whatever is waiting in appt_outbox.
 *
 *   B) CALENDAR — project owned by administrator@logisticswarehouse.net (owns the dock calendar)
 *               Run setupCalendar() once.  Every minute it mirrors new/changed appointments
 *               onto the shared calendar (cancelled = removed).
 *
 * (If one account can both send the emails and edit the calendar, run both setups in one project.)
 * In each project: put the mailer key in KEY_FOR_SETUP before running its setup function.
 */
const SB_URL = 'https://tjivcqxnkftujceumdtx.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaXZjcXhua2Z0dWpjZXVtZHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTE5NDMsImV4cCI6MjEwMDQ2Nzk0M30.GzDc-_u92jvAHq7eG1X-1cet5Av9qF3ZDEVJMRKEP0E';
const FROM_NAME = 'Logistics Warehouse Dock Scheduling';
// Shared Google Calendar that mirrors every appointment (used by the CALENDAR project).
const CAL_ID = 'c_9d6e701ea3c5be07a1e615b0974baf1d13e78f3c40ff22d99bf3b51a1525468c@group.calendar.google.com';
const SITE_ADDRESS = '8501 State Hwy 45, Fort Smith, AR 72916';
const KEY_FOR_SETUP = 'PASTE_MAILER_KEY_HERE';

const NAVY = '#0D2E4A', DARK = '#071A2B', BLUE = '#1F7F6B', TEAL = '#3CAF96', AMBER = '#A85F00', GREEN = '#1E7B3C', RED = '#9E0E26';

function saveKey_() {
  if (KEY_FOR_SETUP && KEY_FOR_SETUP.indexOf('PASTE') !== 0) PropertiesService.getScriptProperties().setProperty('APPT_GAS_KEY', KEY_FOR_SETUP);
  const key = PropertiesService.getScriptProperties().getProperty('APPT_GAS_KEY');
  if (!key) throw new Error('Put the mailer key in KEY_FOR_SETUP first.');
  return key;
}
function everyMinute_(fn) {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === fn; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(fn).timeBased().everyMinutes(1).create();
}
/** EMAIL project: run once. */
function setup() { saveKey_(); everyMinute_('processOutbox'); processOutbox(); }
/** CALENDAR project: run once (as the account that can edit the dock calendar). */
function setupCalendar() {
  saveKey_();
  if (!CalendarApp.getCalendarById(CAL_ID)) throw new Error('This account cannot open the dock calendar (CAL_ID).');
  everyMinute_('syncCalendar'); syncCalendar();
}

function rpc_(fn, args) {
  const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON },
    payload: JSON.stringify(args || {}),
  });
  if (r.getResponseCode() >= 300) throw new Error(fn + ' ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText());
}

function processOutbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const key = PropertiesService.getScriptProperties().getProperty('APPT_GAS_KEY');
    if (!key) throw new Error('Run setup() first — the mailer key is not saved.');
    const res = rpc_('appt_gas_pull', { p_key: key });
    if (!res.ok) throw new Error(res.message || res.error);
    const replyTo = String(res.reply_to || '').split(',')[0].trim();
    const results = [];
    (res.items || []).forEach(function (it) {
      if (it.kind === 'cal') { results.push({ id: it.id, ok: true }); return; } // legacy rows
      try {
        const m = build_(it.kind, it.payload);
        const opts = { name: FROM_NAME, htmlBody: m.html };
        if (replyTo && it.kind.indexOf('team_') !== 0 && it.kind !== 'daily') opts.replyTo = replyTo;
        if (m.ics) opts.attachments = [Utilities.newBlob(m.ics, 'text/calendar', 'LWH-' + it.payload.conf_no + '.ics')];
        GmailApp.sendEmail(it.to, m.subject, m.text, opts);
        results.push({ id: it.id, ok: true });
      } catch (e) {
        results.push({ id: it.id, ok: false, error: String(e && e.message || e) });
      }
    });
    if (results.length) rpc_('appt_gas_mark', { p_key: key, p_results: results });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- shared calendar
var STATUS_ = { BOOKED: '', ARRIVED: 'Checked in', AT_DOOR: 'At door', DONE: 'Done', NO_SHOW: 'NO-SHOW', CANCELLED: 'Cancelled' };

/** CALENDAR project trigger: mirror every new/changed appointment onto the shared calendar. */
function syncCalendar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const key = PropertiesService.getScriptProperties().getProperty('APPT_GAS_KEY');
    if (!key) throw new Error('Run setupCalendar() first — the mailer key is not saved.');
    const res = rpc_('appt_gas_cal_pull', { p_key: key });
    if (!res.ok) throw new Error(res.message || res.error);
    if (!(res.items || []).length) return;
    const cal = CalendarApp.getCalendarById(CAL_ID);
    if (!cal) throw new Error('This account cannot open the dock calendar (CAL_ID).');
    const done = [];
    res.items.forEach(function (a) {
      try { done.push({ id: a.id, updated_at: a.updated_at, event_id: syncOne_(cal, a) }); }
      catch (e) { console.error('Calendar sync failed for ' + a.conf_no + ': ' + (e && e.message || e)); }
    });
    if (done.length) rpc_('appt_gas_cal_done', { p_key: key, p_results: done });
  } finally {
    lock.releaseLock();
  }
}

function syncOne_(cal, a) {
  var ev = null;
  if (a.cal_event_id) { try { ev = cal.getEventById(a.cal_event_id); } catch (e) { ev = null; } }
  if (a.status === 'CANCELLED') { if (ev) ev.deleteEvent(); return ''; }
  var st = new Date(a.start_at), en = new Date(st.getTime() + (a.slot_minutes || 30) * 60000);
  var title = (a.direction === 'IN' ? 'IN' : 'OUT') + ' · ' + a.carrier_name + ' · ' + a.ref_no +
    (a.door ? ' · Door ' + a.door : '') + (STATUS_[a.status] ? ' [' + STATUS_[a.status] + ']' : '');
  var desc = [dirName_(a.direction) + ' appointment ' + a.conf_no, 'PO/BOL: ' + a.ref_no, 'Trailer: ' + a.trailer_type + (a.trailer_no ? ' #' + a.trailer_no : ''),
    'Carrier: ' + a.carrier_name + (a.scac ? ' (' + a.scac + ')' : ''), 'Contact: ' + a.contact_name + (a.phone ? ' · ' + a.phone : ''),
    a.email ? 'Email: ' + a.email : '', a.notes ? 'Carrier notes: ' + a.notes : '', a.team_notes ? 'Team notes: ' + a.team_notes : '',
    'Booked by: ' + (a.booked_by === 'carrier' ? 'carrier online' : a.booked_by)].filter(String).join('\n');
  if (!ev) ev = cal.createEvent(title, st, en, { location: SITE_ADDRESS, description: desc });
  else { ev.setTitle(title); ev.setTime(st, en); ev.setDescription(desc); ev.setLocation(SITE_ADDRESS); }
  try { ev.setColor(a.status === 'NO_SHOW' ? CalendarApp.EventColor.GRAY : a.direction === 'IN' ? CalendarApp.EventColor.BLUE : CalendarApp.EventColor.ORANGE); } catch (e) { /* optional */ }
  return ev.getId();
}

// ---------------------------------------------------------------- formatting
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dirName_(d) { return d === 'IN' ? 'Inbound' : 'Outbound'; }
function fmtT_(t) { var p = String(t).split(':'), h = +p[0], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + p[1] + ' ' + ap; }
function baseUrl_(p) { return String(p.manage_url || p.app_url || '').split('?')[0]; }

function shell_(title, color, inner, footer) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3F3F3;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F3F3;"><tr><td align="center" style="padding:20px 10px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #E2E2E2;">' +
    '<tr><td style="background:' + NAVY + ';padding:18px 24px;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">' +
    '<div style="font-size:22px;font-weight:bold;">Logistics Warehouse</div>' +
    '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Dock Appointments &middot; ArcBest</div></td></tr>' +
    '<tr><td style="background:' + TEAL + ';height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="background:' + color + ';height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5;color:#1A1A1A;">' +
    '<div style="font-size:24px;font-weight:bold;margin-bottom:12px;">' + esc_(title) + '</div>' + inner + '</td></tr>' +
    '<tr><td style="background:' + DARK + ';padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#C9D2E3;">' +
    (footer || 'Logistics Warehouse, Inc. &middot; 8501 State Hwy 45, Fort Smith, AR 72916') + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}
function rows_(pairs) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E2E2E2;margin:12px 0;">' +
    pairs.filter(function (p) { return p[1]; }).map(function (p) {
      return '<tr><td style="padding:9px 0;border-bottom:1px solid #EDEDED;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#767676;width:38%;">' + esc_(p[0]) +
        '</td><td style="padding:9px 0;border-bottom:1px solid #EDEDED;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#1A1A1A;">' + esc_(p[1]) + '</td></tr>';
    }).join('') + '</table>';
}
function button_(label, url, color) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;"><tr><td style="background:' + (color || NAVY) + ';">' +
    '<a href="' + esc_(url) + '" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;text-transform:uppercase;letter-spacing:1px;">' + esc_(label) + '</a></td></tr></table>';
}
function whenBox_(p, color) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px;"><tr><td style="border-left:6px solid ' + color + ';background:#F3F6FB;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;">' +
    '<div style="font-size:13px;color:#4A4A4A;text-transform:uppercase;letter-spacing:1px;">' + dirName_(p.direction) + ' appointment &middot; Confirmation</div>' +
    '<div style="font-size:30px;font-weight:bold;letter-spacing:3px;color:' + NAVY + ';">' + esc_(p.conf_no) + '</div>' +
    '<div style="font-size:20px;font-weight:bold;margin-top:4px;">' + esc_(p.pretty_date) + ' at ' + esc_(p.pretty_time) + '</div></td></tr></table>';
}
function details_(p) {
  return rows_([['PO / BOL', p.ref_no], ['Trailer', p.trailer_type + (p.trailer_no ? ' #' + p.trailer_no : '')], ['Carrier', p.carrier_name + (p.scac ? ' (' + p.scac + ')' : '')],
    ['Contact', p.contact_name], ['Phone', p.phone], ['Email', p.email], ['Notes', p.notes], ['Location', p.site_address]]);
}
function mapsUrl_(p) { return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(p.map_q || p.site_address); }
function textOf_(p, lead) {
  return lead + '\n\nConfirmation: ' + p.conf_no + '\n' + dirName_(p.direction) + ' - ' + p.pretty_date + ' at ' + p.pretty_time +
    '\nPO/BOL: ' + p.ref_no + '\nTrailer: ' + p.trailer_type + '\nCarrier: ' + p.carrier_name + '\nLocation: ' + p.site_address +
    (p.manage_url ? '\n\nReschedule or cancel: ' + p.manage_url : '') + '\n\nLogistics Warehouse';
}
function ics_(p, cancel) {
  var st = new Date(p.start_at), en = new Date(st.getTime() + (p.slot_minutes || 30) * 60000);
  var z = function (d) { return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'"); };
  var e = function (s) { return String(s || '').replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Logistics Warehouse//Dock Appointments//EN', 'METHOD:' + (cancel ? 'CANCEL' : 'PUBLISH'), 'BEGIN:VEVENT',
    'UID:' + p.conf_no + '@logisticswarehouse.net', 'SEQUENCE:' + Math.floor(Date.now() / 60000), 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(st), 'DTEND:' + z(en),
    'SUMMARY:' + e(dirName_(p.direction) + ' dock appt ' + p.conf_no + ' - Logistics Warehouse'), 'LOCATION:' + e(p.site_address),
    'DESCRIPTION:' + e('Confirmation ' + p.conf_no + '\nPO/BOL ' + p.ref_no + '\n' + p.instructions + '\nManage: ' + p.manage_url),
    'STATUS:' + (cancel ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

// ---------------------------------------------------------------- templates
function build_(kind, p) {
  var color = p.direction === 'OUT' ? AMBER : BLUE;
  var arrive = '<p style="margin:14px 0 0;padding:12px 14px;background:#E8F0FA;border-left:4px solid ' + BLUE + ';font-size:15px;"><b>When you arrive:</b> ' + esc_(p.instructions) + '</p>';
  var manage = button_('Reschedule or cancel', p.manage_url) +
    '<p style="font-size:14px;color:#4A4A4A;margin:0;"><a href="' + mapsUrl_(p) + '" style="color:' + BLUE + ';">Directions to ' + esc_(p.site_address) + '</a></p>';
  var board = baseUrl_(p) + '?view=board';
  var by = p.booked_by && p.booked_by !== 'carrier' ? ' (booked by ' + p.booked_by + ')' : ' (booked online)';

  switch (kind) {
    case 'confirm':
      return { subject: 'Confirmed: ' + dirName_(p.direction) + ' appointment ' + p.conf_no + ' - ' + p.pretty_date + ' ' + p.pretty_time,
        html: shell_('Your appointment is confirmed', GREEN, '<p style="margin:0 0 10px;">Thank you, ' + esc_(p.contact_name) + '. Your dock appointment is booked.</p>' + whenBox_(p, color) + details_(p) + arrive + manage),
        text: textOf_(p, 'Your dock appointment is confirmed.'), ics: ics_(p) };
    case 'reschedule':
      return { subject: 'Rescheduled: ' + p.conf_no + ' now ' + p.pretty_date + ' ' + p.pretty_time,
        html: shell_('Your appointment was moved', BLUE, '<p style="margin:0 0 10px;">' + (p.by_team ? 'Logistics Warehouse moved your appointment.' : 'Your appointment was rescheduled.') +
          (p.old_pretty ? ' It was <s>' + esc_(p.old_pretty) + '</s>.' : '') + '</p>' + whenBox_(p, color) + details_(p) + arrive + manage),
        text: textOf_(p, 'Your appointment was moved' + (p.old_pretty ? ' from ' + p.old_pretty : '') + '.'), ics: ics_(p) };
    case 'cancel':
      return { subject: 'Cancelled: ' + dirName_(p.direction) + ' appointment ' + p.conf_no,
        html: shell_('Appointment cancelled', RED, '<p style="margin:0 0 10px;">' + (p.by_team ? 'Logistics Warehouse cancelled this appointment.' : 'Your appointment has been cancelled.') + '</p>' +
          whenBox_(p, '#999999') + rows_([['PO / BOL', p.ref_no], ['Carrier', p.carrier_name], ['Reason', p.cancel_reason]]) +
          button_('Book a new time', baseUrl_(p))),
        text: textOf_(p, 'This appointment has been cancelled.' + (p.cancel_reason ? ' Reason: ' + p.cancel_reason : '')), ics: ics_(p, true) };
    case 'reminder':
      return { subject: 'Reminder: ' + dirName_(p.direction) + ' appointment ' + p.conf_no + ' - ' + p.pretty_date + ' ' + p.pretty_time,
        html: shell_('Appointment reminder', color, '<p style="margin:0 0 10px;">This is a reminder of your upcoming dock appointment.</p>' + whenBox_(p, color) + details_(p) + arrive +
          '<p style="font-size:15px;">Can\'t make it? Please reschedule or cancel so the time can go to another carrier.</p>' + manage),
        text: textOf_(p, 'Reminder of your upcoming dock appointment.') };
    case 'team_new':
    case 'team_change':
    case 'team_cancel':
      var lbl = kind === 'team_new' ? 'New' : kind === 'team_change' ? 'Rescheduled' : 'Cancelled';
      var c2 = kind === 'team_cancel' ? RED : kind === 'team_change' ? BLUE : GREEN;
      return { subject: '[Dock] ' + lbl + ' ' + dirName_(p.direction).toLowerCase() + ': ' + p.carrier_name + ' - ' + p.pretty_date + ' ' + p.pretty_time + ' - ' + p.ref_no,
        html: shell_(lbl + ' ' + dirName_(p.direction).toLowerCase() + ' appointment', c2,
          (p.old_pretty ? '<p style="margin:0 0 10px;">Was <s>' + esc_(p.old_pretty) + '</s></p>' : '') +
          (kind === 'team_cancel' && p.cancel_reason ? '<p style="margin:0 0 10px;"><b>Reason:</b> ' + esc_(p.cancel_reason) + '</p>' : '') +
          whenBox_(p, color) + details_(p) + '<p style="font-size:13px;color:#767676;margin:0;">' + esc_(by) + '</p>' + button_('Open dock board', board, DARK)),
        text: lbl + ' ' + dirName_(p.direction) + ' appointment ' + p.conf_no + by + '\n' + p.pretty_date + ' at ' + p.pretty_time + '\nPO/BOL ' + p.ref_no + '\nCarrier ' + p.carrier_name + '\n' + board };
    case 'daily':
      var items = p.items || [];
      var tr = function (a) {
        var c = a.direction === 'OUT' ? AMBER : BLUE;
        return '<tr><td style="padding:9px 8px;border-bottom:1px solid #EDEDED;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;white-space:nowrap;">' + fmtT_(a.local_time) + '</td>' +
          '<td style="padding:9px 8px;border-bottom:1px solid #EDEDED;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:' + c + ';">' + (a.direction === 'IN' ? 'IN' : 'OUT') + '</td>' +
          '<td style="padding:9px 8px;border-bottom:1px solid #EDEDED;font-family:Arial,Helvetica,sans-serif;font-size:15px;">' + esc_(a.carrier_name) + '<br><span style="font-size:13px;color:#4A4A4A;">' + esc_(a.ref_no) + ' &middot; ' + esc_(a.trailer_type) + '</span></td></tr>';
      };
      var nIn = items.filter(function (a) { return a.direction === 'IN'; }).length;
      return { subject: '[Dock] Today ' + p.pretty_date + ': ' + nIn + ' inbound, ' + (items.length - nIn) + ' outbound',
        html: shell_('Today\'s dock schedule', NAVY, '<p style="margin:0 0 10px;">' + esc_(p.pretty_date) + ' &middot; <b>' + nIn + '</b> inbound &middot; <b>' + (items.length - nIn) + '</b> outbound</p>' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ' + DARK + ';">' + items.map(tr).join('') + '</table>' +
          button_('Open dock board', baseUrl_(p) + '?view=board', DARK)),
        text: 'Dock schedule ' + p.pretty_date + '\n\n' + items.map(function (a) { return fmtT_(a.local_time) + '  ' + a.direction + '  ' + a.carrier_name + '  ' + a.ref_no; }).join('\n') };
  }
  throw new Error('Unknown email kind: ' + kind);
}
