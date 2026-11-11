/* Sample data for the prototype: synthetic only. The kit copies it into Proto.state on every page
   load, so every screen reads and changes the same state, and a reload starts fresh.
   Story: Alex applies for jobs, and the app files his job mail. This morning it read three new emails
   (incoming): Maya Cohen's reply in Dana Levi's thread (a sure match), a recruiter naming two clients
   and a Topgig match for a new company (both unsure). The fork "linking" decides what happens to them.
   The calendar invite for the technical chat went to his personal inbox, which the app does not read:
   that is the email he finds and attaches himself ("Add missing email"). */
window.PROTO_DATA = {
  today: "2026-10-29",
  todayLong: "Thursday, October 29",
  clock: 552, // minutes after midnight: the time a change made in the prototype gets (09:12, then on)
  seq: 0,

  stages: ["Applied", "Recruiter screen", "Hiring manager", "Technical", "Final", "Offer"],
  stageClose: { New: 5, Applied: 15, "Recruiter screen": 35, "Hiring manager": 45, Technical: 55, Final: 70, Offer: 85, Won: 100, Lost: 0 },
  lostReasons: { rejected: "Rejected", no_reply: "No reply", dropped: "Dropped" },

  // The other pipelines are outside this prototype: their numbers only fill the sidebar and Today.
  otherPipelines: [
    { name: "Product build", count: 11, active: 2, prospect: 2, contact: 7, meetings: 1, contacted: 5, replied: 1, rate: "20%" },
    { name: "Code review", count: 9, active: 2, prospect: 4, contact: 3, meetings: 1, contacted: 6, replied: 3, rate: "50%" },
    { name: "Team workshops", count: 5, active: 1, prospect: 3, contact: 1, meetings: 0, contacted: 3, replied: 1, rate: "33%" },
  ],
  jobsNumbers: { meetings: 2, contacted: 9, replied: 6, rate: "67%" },

  apps: [
    {
      id: "northwind", company: "Northwind Labs", role: "Staff AI Engineer",
      pay: "$210K to $240K", payTop: 240, where: "Remote (EU hours)", whereKind: "Remote",
      size: "About 120 people", source: "LinkedIn",
      stage: "Recruiter screen", close: 35, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Call", day: "2026-10-27" },
      next: "Follow up with Dana", due: "2026-10-29",
      people: [
        { id: "p-dana", name: "Dana Levi", title: "Recruiter", email: "dana@northwindlabs.io", contacted: "Call, Oct 27" },
      ],
      timeline: [
        { id: "e-nw-1", day: "2026-10-21", kind: "applied", mail: "m-confirm", text: "Applied via LinkedIn", detail: "Applied on LinkedIn with the AI engineering CV and a short note on agent evals. The post: Staff AI Engineer, $210K to $240K, remote in EU hours." },
        { id: "e-nw-2", day: "2026-10-24", kind: "email", mail: "m-dana", text: "Email in from Dana Levi: \"Quick chat this week?\"" },
        { id: "e-nw-3", day: "2026-10-27", kind: "call", who: "p-dana", text: "Call: recruiter screen with Dana Levi", detail: "30 minutes. Dana asked how I ship LLM features to production and how I measure them. The team is 8 engineers and reports to Maya Cohen, the hiring manager. Dana passes her notes to Maya; a chat with Maya would come next." },
      ],
    },
    {
      id: "halden", company: "Halden Grid", role: "Principal Engineer",
      pay: "$185K to $215K", payTop: 215, where: "Hybrid, Berlin", whereKind: "Hybrid",
      size: "About 300 people", source: "Welljobs",
      stage: "Technical", close: 55, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: "2026-10-23" },
      next: "Send the take-home", due: "2026-10-28",
      people: [
        { id: "p-jonas", name: "Jonas Berg", title: "Engineering manager", email: "jonas@haldengrid.example", contacted: "Call, Oct 16" },
      ],
      timeline: [
        { id: "e-ha-1", day: "2026-10-12", kind: "applied", text: "Applied via Welljobs", detail: "Applied on Welljobs. The post: Principal Engineer, $185K to $215K, hybrid in Berlin, two days a week in the office." },
        { id: "e-ha-2", day: "2026-10-16", kind: "call", who: "p-jonas", text: "Call with Jonas Berg", detail: "45 minutes with the engineering manager. A grid forecasting platform in Python and Rust. He wants a take-home next." },
        { id: "e-ha-3", day: "2026-10-23", kind: "email", mail: "m-halden", text: "Email in from Jonas Berg: \"Take-home brief\"" },
      ],
    },
    {
      id: "vela", company: "Vela Labs", role: "Head of AI Engineering",
      pay: "$230K to $260K", payTop: 260, where: "Remote (US hours)", whereKind: "Remote",
      size: "About 80 people", source: "Referral",
      stage: "Final", close: 70, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: "2026-10-26" },
      next: "Prep the final round", due: "2026-11-02",
      people: [
        { id: "p-lena", name: "Lena Park", title: "CTO", email: "lena@velalabs.example", contacted: "Interview, Oct 20" },
      ],
      timeline: [
        { id: "e-ve-1", day: "2026-10-09", kind: "applied", text: "Referred by Erik Holm", detail: "Erik Holm, a former teammate, sent my CV to Lena Park. Head of AI Engineering, $230K to $260K, remote in US hours." },
        { id: "e-ve-2", day: "2026-10-14", kind: "call", text: "Recruiter call", detail: "20 minutes on scope and pay. The range fits; she booked the interview with Lena." },
        { id: "e-ve-3", day: "2026-10-20", kind: "call", who: "p-lena", text: "Interview with Lena Park", detail: "An hour with the CTO: system design for an evaluation pipeline, then how I would grow the team. She moved me to the final round." },
        { id: "e-ve-4", day: "2026-10-26", kind: "email", mail: "m-vela", text: "Email in from Lena Park: \"Final round: Monday Nov 2\"" },
      ],
    },
    {
      id: "nimbus", company: "Nimbus Robotics", role: "Staff Engineer, AI",
      pay: "$175K to $200K", payTop: 200, where: "On-site, Lisbon", whereKind: "On-site",
      size: "About 150 people", source: "LinkedIn",
      stage: "Hiring manager", close: 45, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: "2026-10-25" },
      next: "Book the hiring manager call", due: "2026-10-29",
      people: [
        { id: "p-omar", name: "Omar Haddad", title: "Head of AI", email: "omar@nimbusrobotics.example", contacted: "Email, Oct 25" },
      ],
      timeline: [
        { id: "e-ni-1", day: "2026-10-18", kind: "applied", text: "Applied via LinkedIn", detail: "Applied on LinkedIn. Staff Engineer, AI, $175K to $200K, on-site in Lisbon." },
        { id: "e-ni-2", day: "2026-10-22", kind: "call", text: "Recruiter call", detail: "30 minutes. The robotics perception team wants someone to own their LLM tooling. Next: Omar Haddad, the head of AI." },
        { id: "e-ni-3", day: "2026-10-25", kind: "email", mail: "m-nimbus", text: "Email in from Omar Haddad: \"Next step\"" },
      ],
    },
    {
      id: "orbital", company: "Orbital Payments", role: "Staff AI Engineer",
      pay: "$200K to $225K", payTop: 225, where: "Remote", whereKind: "Remote",
      size: "About 400 people", source: "LinkedIn",
      stage: "Applied", close: 15, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Applied", day: "2026-10-19" },
      next: "Message the CTO", due: "2026-10-27",
      people: [],
      timeline: [{ id: "e-or-1", day: "2026-10-19", kind: "applied", text: "Applied via LinkedIn", detail: "Applied on LinkedIn. Staff AI Engineer, $200K to $225K, remote. No reply yet." }],
    },
    {
      id: "quarry", company: "Quarry Data", role: "AI Platform Lead",
      pay: "$160K to $185K", payTop: 185, where: "Hybrid, London", whereKind: "Hybrid",
      size: "About 60 people", source: "Welljobs",
      stage: "Applied", close: 15, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Applied", day: "2026-10-25" },
      next: "Check for a reply", due: "2026-11-04",
      people: [],
      timeline: [{ id: "e-qu-1", day: "2026-10-25", kind: "applied", text: "Applied via Welljobs", detail: "Applied on Welljobs. AI Platform Lead, $160K to $185K, hybrid in London." }],
    },
    {
      id: "tessel", company: "Tessel AI", role: "Senior ML Engineer",
      pay: "$150K to $175K", payTop: 175, where: "On-site, Amsterdam", whereKind: "On-site",
      size: "About 45 people", source: "Topgig",
      stage: "Recruiter screen", close: 35, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: "2026-10-26" },
      next: "Recruiter call", due: "2026-10-30",
      people: [
        { id: "p-sofia", name: "Sofia Petrov", title: "Recruiter", email: "sofia@tessel.example", contacted: "Email, Oct 26" },
      ],
      timeline: [
        { id: "e-te-1", day: "2026-10-20", kind: "applied", text: "Matched by Topgig", detail: "Topgig matched me with the role: Senior ML Engineer, $150K to $175K, on-site in Amsterdam." },
        { id: "e-te-2", day: "2026-10-26", kind: "email", mail: "m-tessel", text: "Email in from Sofia Petrov: \"Recruiter call Friday?\"" },
      ],
    },
    {
      id: "brightline", company: "Brightline Health", role: "Principal AI Engineer",
      pay: "$220K to $250K", payTop: 250, where: "Remote (EU hours)", whereKind: "Remote",
      size: "About 900 people", source: "Referral",
      stage: "Offer", close: 85, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: "2026-10-28" },
      next: "Answer the offer", due: "2026-10-29",
      people: [
        { id: "p-priya", name: "Priya Shah", title: "VP Engineering", email: "priya@brightline.example", contacted: "Email, Oct 28" },
      ],
      timeline: [
        { id: "e-br-1", day: "2026-10-05", kind: "applied", text: "Referred by Noa Weiss", detail: "Noa Weiss, who works there, referred me. Principal AI Engineer, $220K to $250K, remote in EU hours." },
        { id: "e-br-2", day: "2026-10-12", kind: "call", text: "Recruiter call", detail: "25 minutes on the role and the process: a technical interview, then a final round." },
        { id: "e-br-3", day: "2026-10-19", kind: "call", text: "Technical interview", detail: "Two hours: live coding on a retrieval service, then a design review of a clinical notes assistant." },
        { id: "e-br-4", day: "2026-10-23", kind: "call", who: "p-priya", text: "Final round with Priya Shah", detail: "Leadership and culture round with the VP Engineering. She said an offer would follow this week." },
        { id: "e-br-5", day: "2026-10-28", kind: "email", mail: "m-bright", text: "Email in from Priya Shah: \"Your offer from Brightline Health\"" },
      ],
    },
    {
      id: "copperline", company: "Copperline", role: "Engineering Manager, AI",
      pay: "$180K to $200K", payTop: 200, where: "Hybrid, Berlin", whereKind: "Hybrid",
      size: "About 200 people", source: "LinkedIn",
      stage: "Lost", close: 0, lostReason: "rejected", closedOn: "2026-10-22", reopenTo: "Hiring manager",
      touch: { kind: "Email", day: "2026-10-22" },
      next: "", due: "",
      people: [
        { id: "p-marco", name: "Marco Ruiz", title: "Talent partner", email: "marco@copperline.example", contacted: "Email, Oct 22" },
      ],
      timeline: [
        { id: "e-co-1", day: "2026-10-06", kind: "applied", text: "Applied via LinkedIn", detail: "Applied on LinkedIn. Engineering Manager, AI, $180K to $200K, hybrid in Berlin." },
        { id: "e-co-2", day: "2026-10-13", kind: "call", who: "p-marco", text: "Recruiter call with Marco Ruiz", detail: "30 minutes. Marco walked through the team and booked the hiring manager round." },
        { id: "e-co-3", day: "2026-10-22", kind: "email", mail: "m-copper", text: "Email in from Marco Ruiz: \"About your application\"" },
      ],
    },
  ],

  // The mailbox. linkedTo is the application an email is filed on (null: not linked), why says why it
  // was filed there, and reads is what the app reads from an email when it is linked to that application.
  // incoming: new mail the app read this morning (what happens to it is the fork "linking"; waiting:
  // it waits in To confirm). inbox: "Work" unless said; the app does not read the personal inbox.
  // ignored: Alex marked it not relevant. reads.sure: the app is sure (same thread, same sender).
  mail: [
    {
      id: "m-maya", day: "2026-10-28", time: "16:40", fromName: "Maya Cohen", fromEmail: "maya@northwindlabs.io",
      subject: "Re: Quick chat this week?", thread: "t-northwind", linkedTo: null, incoming: true,
      text: "Hi Alex,\n\nThanks for the call with Dana on Tuesday. She passed on her notes, and I'd like to move you forward for the Staff AI Engineer role at Northwind Labs.\n\nNext step: a technical chat with me and one of our staff engineers, about 60 minutes. Does Nov 3 work? Any time after 10:00 CET is fine.\n\nBest,\nMaya Cohen\nHiring manager, Northwind Labs",
      reads: {
        app: "northwind",
        person: { name: "Maya Cohen", title: "Hiring manager", email: "maya@northwindlabs.io" },
        stage: "Hiring manager", next: "Technical chat", due: "2026-11-03", sure: true,
        why: "same thread as Dana Levi's email, names Northwind Labs and the Staff AI Engineer role",
      },
    },
    {
      id: "m-sam", day: "2026-10-29", time: "06:50", fromName: "Sam Rivera", fromEmail: "sam@talentbridge.example",
      subject: "Two AI roles that fit you", thread: "t-sam", linkedTo: null, incoming: true,
      text: "Hi Alex,\n\nI recruit for two teams that would fit your background: Orbital Payments (Staff AI Engineer, remote) and a fintech client in Berlin I cannot name yet. Are you open to a call this week about both?\n\nSam Rivera\nTalentBridge Recruiting",
      reads: {
        app: "orbital", sure: false,
        person: { name: "Sam Rivera", title: "Recruiter, TalentBridge", email: "sam@talentbridge.example" },
        next: "Call Sam Rivera about the two roles", due: "2026-10-30",
        why: "names Orbital Payments, but also a client it does not name",
      },
    },
    {
      id: "m-topgig", day: "2026-10-29", time: "07:05", fromName: "Topgig Matching", fromEmail: "matching@topgig.example",
      subject: "New match: Lead AI Engineer at Kestrel Bio", thread: "t-topgig", linkedTo: null, incoming: true,
      text: "Hi Alex,\n\nYou have a new match: Lead AI Engineer at Kestrel Bio, a biotech in Copenhagen. Remote, with one week a month on site, $190K to $220K. Reply to this email if you want an intro.\n\nTopgig Matching",
      reads: {
        lead: { company: "Kestrel Bio", role: "Lead AI Engineer" }, sure: false,
        why: "a new company: Kestrel Bio is not in your applications yet",
      },
    },
    {
      id: "m-invite", day: "2026-10-29", time: "08:05", fromName: "MeetBook", fromEmail: "invites@meetbook.example",
      subject: "Invitation: Technical chat, Northwind Labs, Tue Nov 3", thread: "t-invite", linkedTo: null, inbox: "Personal",
      text: "Maya Cohen invited you to a meeting.\n\nTechnical chat, Northwind Labs\nTuesday, November 3, 2026, 10:30 to 11:30 CET\nWith Maya Cohen (hiring manager) and Ilan Rosen (staff engineer)\n\nThe video link is in the calendar event.",
      reads: {
        app: "northwind",
        person: { name: "Ilan Rosen", title: "Staff engineer", email: "ilan@northwindlabs.io" },
        stage: "Technical", next: "Technical chat, 10:30 CET", due: "2026-11-03",
        why: "names Northwind Labs and Maya Cohen, the hiring manager",
      },
    },
    {
      id: "m-bright", day: "2026-10-28", time: "17:55", fromName: "Priya Shah", fromEmail: "priya@brightline.example",
      subject: "Your offer from Brightline Health", thread: "t-brightline", linkedTo: "brightline",
      why: "Filed by the app: from brightline.example, same thread as the final round invite",
      text: "Hi Alex,\n\nWe loved the final round. The offer is attached: $240K base, remote within EU hours, start in January.\n\nCould you let us know by Thursday?\n\nPriya",
    },
    {
      id: "m-news", day: "2026-10-27", time: "07:00", fromName: "Weekly AI digest", fromEmail: "digest@newsletter.example",
      subject: "Agents in production: five lessons", thread: "t-news", linkedTo: null,
      text: "This week: five lessons from teams running agents in production, a new eval toolkit, and the hiring market for AI engineers.",
    },
    {
      id: "m-alert", day: "2026-10-26", time: "08:15", fromName: "Jobs digest", fromEmail: "alerts@jobs.example",
      subject: "12 new AI roles for you", thread: "t-alerts", linkedTo: null,
      text: "New roles that fit your search:\n\nStaff ML Engineer at Northwind Labs, Remote\nAI Platform Lead at Ferro Systems, Hybrid, Munich\nPrincipal Engineer at Lumen Health, Remote\n\nand 9 more.",
    },
    {
      id: "m-vela", day: "2026-10-26", time: "08:02", fromName: "Lena Park", fromEmail: "lena@velalabs.example",
      subject: "Final round: Monday Nov 2", thread: "t-vela", linkedTo: "vela",
      text: "Hi Alex,\n\nThe team enjoyed the interview. We would like you to join us for the final round on Monday, Nov 2, with our CEO and two staff engineers.\n\nLena",
    },
    {
      id: "m-tessel", day: "2026-10-26", time: "11:20", fromName: "Sofia Petrov", fromEmail: "sofia@tessel.example",
      subject: "Recruiter call Friday?", thread: "t-tessel", linkedTo: "tessel",
      why: "Filed by the app: from tessel.example, names the Senior ML Engineer role",
      text: "Hi Alex,\n\nTopgig matched you with our Senior ML Engineer role. Do you have 30 minutes on Friday for a first call?\n\nSofia",
    },
    {
      id: "m-nimbus", day: "2026-10-25", time: "14:10", fromName: "Omar Haddad", fromEmail: "omar@nimbusrobotics.example",
      subject: "Next step", thread: "t-nimbus", linkedTo: "nimbus",
      why: "Filed by the app: from nimbusrobotics.example, names the Staff Engineer, AI role",
      text: "Hi Alex,\n\nThanks for the chat with our recruiter. I would like to meet you myself. Can you book 45 minutes with me next week?\n\nOmar Haddad\nHead of AI, Nimbus Robotics",
    },
    {
      id: "m-dana", day: "2026-10-24", time: "10:05", fromName: "Dana Levi", fromEmail: "dana@northwindlabs.io",
      subject: "Quick chat this week?", thread: "t-northwind", linkedTo: "northwind",
      why: "Filed by the app: from northwindlabs.io, names the Staff AI Engineer role",
      text: "Hi Alex,\n\nThanks for applying to the Staff AI Engineer role. Do you have 30 minutes on Tuesday for a quick chat?\n\nDana Levi\nRecruiter, Northwind Labs",
    },
    {
      id: "m-halden", day: "2026-10-23", time: "12:24", fromName: "Jonas Berg", fromEmail: "jonas@haldengrid.example",
      subject: "Take-home brief", thread: "t-halden", linkedTo: "halden",
      text: "Hi Alex,\n\nAs promised, the take-home brief is below. Most people spend about four hours on it. Send it back by Wednesday if you can.\n\nJonas",
    },
    {
      id: "m-copper", day: "2026-10-22", time: "09:00", fromName: "Marco Ruiz", fromEmail: "marco@copperline.example",
      subject: "About your application", thread: "t-copper", linkedTo: "copperline",
      why: "Filed by the app: from copperline.example, names the Engineering Manager, AI role",
      text: "Hi Alex,\n\nThank you for your time with the team. We have decided to move forward with another candidate for this role, and we will keep your details for future openings.\n\nMarco Ruiz\nTalent partner, Copperline",
    },
    {
      id: "m-confirm", day: "2026-10-21", time: "09:30", fromName: "Northwind Labs Talent", fromEmail: "talent@northwindlabs.io",
      subject: "Thanks for applying: Staff AI Engineer", thread: "t-northwind-apply", linkedTo: "northwind",
      why: "Filed by the app: the confirmation of your application",
      text: "Thanks for applying to the Staff AI Engineer role at Northwind Labs. Our team reads every application and will be in touch.",
    },
  ],


  // Every change the app or Alex made, newest first; mail is the email it came from. ops say what
  // changed, so Undo can put it back; the state above already holds each change's "after" values.
  changes: [
    {
      id: "c-s1", at: "Oct 28, 18:05", app: "brightline", mail: "m-bright", what: "Stage: Final to Offer",
      details: ["Close: 70% to 85%", "Next step: Answer the offer, Oct 29"],
      why: "Email from Priya Shah, \"Your offer from Brightline Health\"", by: "app", state: "done", isNew: true, ok: false,
      ops: [
        { type: "field", app: "brightline", field: "stage", before: "Final", after: "Offer" },
        { type: "field", app: "brightline", field: "close", before: 70, after: 85 },
        { type: "field", app: "brightline", field: "next", before: "Wait for the final round result", after: "Answer the offer" },
        { type: "field", app: "brightline", field: "due", before: "2026-10-30", after: "2026-10-29" },
      ],
    },
    {
      id: "c-s2", at: "Oct 27, 16:20", app: "northwind", what: "Stage: Applied to Recruiter screen",
      details: ["Close: 15% to 35%"],
      why: "You logged the call with Dana Levi", by: "you", state: "done", isNew: false,
      ops: [
        { type: "field", app: "northwind", field: "stage", before: "Applied", after: "Recruiter screen" },
        { type: "field", app: "northwind", field: "close", before: 15, after: 35 },
      ],
    },
    {
      id: "c-s3", at: "Oct 26, 08:10", app: "vela", mail: "m-vela", what: "Linked an email: \"Final round: Monday Nov 2\"",
      details: ["Stage: Technical to Final", "Close: 55% to 70%"],
      why: "From velalabs.example, same thread as the interview invite", by: "app", state: "done", isNew: false, ok: true,
      ops: [
        { type: "link", app: "vela", mail: "m-vela", before: null, after: "vela" },
        { type: "field", app: "vela", field: "stage", before: "Technical", after: "Final" },
        { type: "field", app: "vela", field: "close", before: 55, after: 70 },
      ],
    },
    {
      id: "c-s4", at: "Oct 23, 12:30", app: "halden", mail: "m-halden", what: "Linked an email: \"Take-home brief\"",
      details: ["Stage: Hiring manager to Technical", "Close: 45% to 55%"],
      why: "From haldengrid.example, names the Principal Engineer role", by: "app", state: "done", isNew: false, ok: true,
      ops: [
        { type: "link", app: "halden", mail: "m-halden", before: null, after: "halden" },
        { type: "field", app: "halden", field: "stage", before: "Hiring manager", after: "Technical" },
        { type: "field", app: "halden", field: "close", before: 45, after: 55 },
      ],
    },
    {
      id: "c-s5", at: "Oct 22, 09:02", app: "copperline", mail: "m-copper", what: "Lost, rejected",
      details: ["Stage: Hiring manager to Lost", "Close: 45% to 0%"],
      why: "Email from Marco Ruiz, \"About your application\"", by: "app", state: "done", isNew: false, ok: true,
      ops: [
        { type: "field", app: "copperline", field: "stage", before: "Hiring manager", after: "Lost" },
        { type: "field", app: "copperline", field: "close", before: 45, after: 0 },
        { type: "field", app: "copperline", field: "lostReason", before: null, after: "rejected" },
        { type: "field", app: "copperline", field: "closedOn", before: null, after: "2026-10-22" },
        { type: "field", app: "copperline", field: "next", before: "Wait for feedback", after: "" },
        { type: "field", app: "copperline", field: "due", before: "2026-10-23", after: "" },
      ],
    },
  ],

  // The Applications table: tab, sort, search and column filters. Kept here so it survives a visit
  // to a company page and back.
  table: { tab: "open", sort: null, dir: null, q: "", text: {}, picks: {} },

  // Screen state: open menus and forms, the notice after a change, the paste box, errors.
  ui: {
    menuOpen: false, menu: null, menuFocus: false, focusHeader: null,
    notice: null, keepNotice: false, nextOpen: null, lostReason: "rejected",
    mailQ: {}, attachTo: {}, err: {}, openMail: {}, linkAsk: null, pick: null, pickTo: {},
    lastPath: null,
  },
};
