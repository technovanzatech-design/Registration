export const site = {
  symposium: "TECHNOVANZA 2026",
  theme: "Proud to be an Engineer ",
  tagline: "Where Creativity Meets Technology",
  college: "Anjalai Ammal Mahalingam Engineering College",
  department: "Department of Computer Science and Engineering",
  venue: "Main Auditorium, Tech Block A",
  date: "Saturday, 29 August 2026",
  time: "09:00 AM – 05:00 PM",
  address:
    "Anjalai Ammal Mahalingam Engineering College, Kovilvenni, Thiruvarur District, Tamil Nadu 614403",
  facultyCoordinator: {
    name: "Dr. Ananya Raghavan",
    role: "Faculty Coordinator, Dept. of Computer Science and Engineering",
    phone: "+91 98400 12345",
    email: "ananya.raghavan@aamec.edu.in",
  },
  studentCoordinator: {
    name: "NAVEEN S",
    role: "Student Coordinator, Final Year CSE",
    phone: "+91 9042845757",
    email: "technovanzacse26@gmail.com",
  },
  registrationHelp: [
    { name: "Naveen", phone: "9042845757" },
    { name: "Niveesh", phone: "8637689191" },
    { name: "Madhavan", phone: "9600496137" },
  ],
  social: {
    instagram: "https://instagram.com",
    linkedin: "https://linkedin.com",
    website: "https://aamec.edu.in",
  },
} as const;

export const navLinks = [{ label: "Registration", to: "/registration" }] as const;

export const rules = [
  "Each participant must register for exactly one Technical event and one Non-Technical event.",
  "Registration is only for other colleges. Register numbers starting with 8204 are not eligible.",
  "Register only once using your University Register Number, Gmail address, and phone number. Duplicate details are not permitted.",
  "TechTalks, Fun Feast, and Nexus are two-member team events. Both team members must be registered.",
  "For a team event, enter your teammate’s full name, register number, Gmail address, and phone number.",
  "Your teammate’s seat is reserved immediately. They must later return using their own details to choose their remaining event.",
  "A reserved teammate is not treated as a duplicate and may choose only the event category still pending for them.",
  "For more than one two-member event, you may use the same teammate or different teammates.",
  "Event capacity is limited: WebNova, Prompt Maestro and CodeFusion: 30 each; TechTalks: 40 / 20 teams (the final 5 teams register for TechTalks only); Fun Feast: 50 / 25 teams; Brain Battle: 20; Nexus: 30 / 15 teams; Checkmate Challenge: 20.",
  "Registrations close automatically once an event reaches capacity.",
  "A provisional card may be issued for a reserved teammate. The final card is issued after their registration is complete.",
  "Bring your college ID card and registration entry card on the event day.",
  "Incorrect, false, or duplicate information may lead to cancellation of registration.",
  "Report to the venue on time and follow coordinator instructions. Coordinators’ and judges’ decisions are final.",
];
