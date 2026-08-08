import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { downloadEntryCard, getEntryCardBlob } from "@/lib/entryCard";

import { uploadEntryCard } from "@/lib/storage";
import { sendRegistrationEmail } from "@/lib/email";
import {
  getEventCapacities,
  getTotalRegistrations,
  type EventCapacityRow,
} from "@/lib/eventCapacity";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Home,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { events } from "@/data/events";
import { site, rules } from "@/data/site";
import { EventIcon } from "@/components/EventIcon";
import { StepProgress } from "@/components/registration/StepProgress";
import {
  createRegistration,
  completePartnerRegistration,
  findReservedTeammateByContact,
  getRegistrationCardDetails,
  getRegistrationContactOwner,
  getReservedTeammate,
  getRegistrationStatus,
  teammateEventCount,
} from "@/lib/registrations";
import type { Registration } from "@/types";
import type { ReservedTeammate } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registration")({
  head: () => ({
    meta: [
      { title: "Register — TECHNOVANZA 2026" },
      {
        name: "description",
        content:
          "Register for TECHNOVANZA 2026. Choose one technical and one non-technical event and get an instant receipt.",
      },
      { property: "og:title", content: "Register — TECHNOVANZA 2026" },
      {
        property: "og:description",
        content:
          "Registration for TECHNOVANZA 2026 — one technical event, one non-technical event.",
      },
    ],
  }),
  component: RegistrationPage,
});

const schema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name").max(80),
  registerNumber: z
    .string()
    .trim()
    .min(6, "Enter a valid university register number")
    .max(20)
    .refine((value) => !value.startsWith("8204"), {
      message: "Your register number belongs to our college. Registration is only for other colleges.",
    }),
  collegeName: z.string().trim().min(3, "Enter your college name").max(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(255)
    .refine((v) => v.toLowerCase().endsWith("@gmail.com"), {
      message: "Please use a Gmail address",
    }),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit phone number"),
});

type FormValues = z.infer<typeof schema>;

// Steps here match the ORIGINAL 4-step StepProgress exactly:
// 1 Personal · 2 Contact · 3 Events · 4 Review.
// Rules agreement happens BEFORE any of this — it's a separate gate
// screen, not one of the 4 steps.
const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
  1: ["fullName", "registerNumber", "collegeName"],
  2: ["email", "phone"],
};

const REQUIRED_EVENTS = 2;
const TOTAL_CAP = 120;
const TECHTALKS_REGULAR_SEATS = 30;

type TeammateField = "fullName" | "registerNumber" | "email" | "phone";

function teammateValidationError(
  teammate: { fullName: string; registerNumber: string; email: string; phone: string },
  eventName: string,
) {
  if (Object.values(teammate).some((value) => !value.trim())) return `Enter all ${eventName} teammate details.`;
  if (!teammate.email.trim().toLowerCase().endsWith("@gmail.com")) {
    return `Enter a valid Gmail address for the ${eventName} teammate.`;
  }
  if (!/^[6-9]\d{9}$/.test(teammate.phone.trim())) {
    return `Enter a valid 10-digit phone number for the ${eventName} teammate.`;
  }
  return null;
}

function teammateFieldError(
  field: TeammateField,
  value: string,
  participant: FormValues,
) {
  const cleaned = value.trim();
  if (!cleaned) return "This field is required.";
  if (field === "email" && !cleaned.toLowerCase().endsWith("@gmail.com")) {
    return "Enter a valid Gmail address ending in @gmail.com.";
  }
  if (field === "email" && cleaned.toLowerCase() === participant.email.trim().toLowerCase()) {
    return "Teammate Gmail address must be different from Member A's Gmail address.";
  }
  if (field === "phone" && !/^[6-9]\d{9}$/.test(cleaned)) {
    return "Enter a valid 10-digit phone number.";
  }
  if (field === "phone" && cleaned === participant.phone.trim()) {
    return "Teammate phone number must be different from Member A's phone number.";
  }
  if (field === "registerNumber" && cleaned === participant.registerNumber.trim()) {
    return "Teammate register number must be different from Member A's register number.";
  }
  if (field === "registerNumber" && cleaned.startsWith("8204")) {
    return "This register number belongs to our college. Registration is only for other colleges.";
  }
  return null;
}

function RegistrationPage() {
  const [rulesAgreed, setRulesAgreed] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(false);

  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Registration | null>(null);
  const [completingPartner, setCompletingPartner] = useState(false);
  const [lockedCategory, setLockedCategory] = useState<"technical" | "non-technical" | null>(null);
  const [reservedTeammate, setReservedTeammate] = useState<ReservedTeammate | null>(null);
  const [teammateFieldErrors, setTeammateFieldErrors] = useState<Record<string, string>>({});
  const [partner, setPartner] = useState({
    fullName: "",
    registerNumber: "",
    email: "",
    phone: "",
  });
  const [techTalkPartner, setTechTalkPartner] = useState({
    fullName: "",
    registerNumber: "",
    email: "",
    phone: "",
  });
  const [funFeastPartner, setFunFeastPartner] = useState({
    fullName: "",
    registerNumber: "",
    email: "",
    phone: "",
  });

  const [capacities, setCapacities] = useState<EventCapacityRow[] | null>(null);
  const [totalRegistered, setTotalRegistered] = useState<number | null>(null);
  const [loadingCapacity, setLoadingCapacity] = useState(true);
  const [capacityError, setCapacityError] = useState(false);

  const refreshCapacity = async () => {
    try {
      const [caps, total] = await Promise.all([getEventCapacities(), getTotalRegistrations()]);
      setCapacities(caps);
      setTotalRegistered(total);
      setCapacityError(false);
    } catch (error) {
      console.error("Couldn't load capacity data:", error);
      setCapacityError(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [caps, total] = await Promise.all([getEventCapacities(), getTotalRegistrations()]);
        if (!cancelled) {
          setCapacities(caps);
          setTotalRegistered(total);
        }
      } catch (error) {
        console.error("Couldn't load capacity data:", error);
        if (!cancelled) setCapacityError(true);
      } finally {
        if (!cancelled) setLoadingCapacity(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const seatsFor = (slug: string) => capacities?.find((c) => c.event_slug === slug);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      registerNumber: "",
      collegeName: "",
      email: "",
      phone: "",
    },
  });

  const values = form.watch();

  useEffect(() => {
    if (
      reservedTeammate &&
      values.registerNumber.trim() !== reservedTeammate.registerNumber
    ) {
      setReservedTeammate(null);
      setCompletingPartner(false);
      setLockedCategory(null);
    }
  }, [reservedTeammate, values.registerNumber]);

  const selectedTechnical = selected.find(
    (id) => events.find((e) => e.id === id)?.category === "technical",
  );
  const selectedNonTechnical = selected.find(
    (id) => events.find((e) => e.id === id)?.category === "non-technical",
  );
  const selectedDuo = selected.some((id) => ["techtalks", "fun-feast", "nexus"].includes(id));
  const primaryTeammate = completingPartner
    ? partner
    : selected.includes("techtalks")
      ? techTalkPartner
      : funFeastPartner;
  const primaryTeammateKey = completingPartner
    ? "partner"
    : selected.includes("techtalks")
      ? "techTalkPartner"
      : "funFeastPartner";
  const isTechTalksBonus =
    !completingPartner &&
    selected.length === 1 &&
    selected[0] === "techtalks" &&
    (seatsFor("techtalks")?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS;
  const eventsComplete = completingPartner
    ? selected.length === 1
    : isTechTalksBonus || Boolean(selectedTechnical && selectedNonTechnical);

  const next = async () => {
    const fields = STEP_FIELDS[step];
    if (fields) {
      const valid = await form.trigger(fields);
      if (!valid) return;
    }

    // STEP 1 — Register number duplicate check
    if (step === 1) {
      setChecking(true);
      const status = await getRegistrationStatus(values.registerNumber);
      setChecking(false);

      if (status === "complete") {
        form.setError("registerNumber", {
          type: "manual",
          message: "This University Register Number is already registered.",
        });
        return;
      }

      if (status.startsWith("pending_partner_")) {
        setCompletingPartner(true);
        setLockedCategory(status.replace("pending_partner_", "") as "technical" | "non-technical");
        const teammate = await getReservedTeammate(values.registerNumber);
        if (teammate) {
          setReservedTeammate(teammate);
          form.setValue("email", teammate.email, { shouldValidate: true });
          form.setValue("phone", teammate.phone, { shouldValidate: true });
        }
      }

      setStep(2);
      return;
    }

    // STEP 2 — Email/phone duplicate check
    if (step === 2) {
      setChecking(true);
      let reservedByContact;
      let contactOwner;
      try {
        [reservedByContact, contactOwner] = await Promise.all([
          findReservedTeammateByContact(values.email, values.phone),
          getRegistrationContactOwner(values.email, values.phone),
        ]);
      } catch (error) {
        console.error("Contact verification error:", error);
        setChecking(false);
        setSubmitError("Could not verify email and phone details. Please try again.");
        return;
      }
      setChecking(false);

      if (reservedByContact && reservedByContact.registerNumber !== values.registerNumber.trim()) {
        form.setError("registerNumber", {
          type: "manual",
          message: `These contact details belong to a reserved teammate. Enter the correct register number: ${reservedByContact.registerNumber}`,
        });
        setStep(1);
        return;
      }

      if (contactOwner && contactOwner.registerNumber !== values.registerNumber.trim()) {
        form.setError("email", {
          type: "manual",
          message: "This Gmail address or phone number is already registered.",
        });
        form.setError("phone", {
          type: "manual",
          message: "This Gmail address or phone number is already registered.",
        });
        return;
      }

      setStep(3);
      return;
    }

    // STEP 3 — Event validation: exactly one technical + one non-technical
    if (step === 3) {
      if (!eventsComplete) return;
      const teammateRegisterNumbers = completingPartner
        ? [partner.registerNumber]
        : [
            ...(selected.includes("techtalks") ? [techTalkPartner.registerNumber] : []),
            ...((selected.includes("fun-feast") || selected.includes("nexus"))
              ? [funFeastPartner.registerNumber]
              : []),
          ];
      if (teammateRegisterNumbers.some((number) => number.trim().startsWith("8204"))) {
        setSubmitError("Your teammate's register number belongs to our college. Registration is only for other colleges.");
        return;
      }
      const teammateError = completingPartner && selectedDuo
        ? teammateValidationError(partner, "team-event")
        : (selected.includes("techtalks")
            ? teammateValidationError(techTalkPartner, "TechTalks")
            : null) ||
          ((selected.includes("fun-feast") || selected.includes("nexus"))
            ? teammateValidationError(funFeastPartner, selected.includes("nexus") ? "Nexus" : "Fun Feast")
            : null);
      if (teammateError) {
        setSubmitError(teammateError);
        return;
      }
      const teammatesToCheck = completingPartner
        ? selectedDuo
          ? [partner]
          : []
        : [
            ...(selected.includes("techtalks") ? [techTalkPartner] : []),
            ...((selected.includes("fun-feast") || selected.includes("nexus"))
              ? [funFeastPartner]
              : []),
          ];
      let eventCounts: number[];
      try {
        eventCounts = await Promise.all(teammatesToCheck.map(teammateEventCount));
      } catch (error) {
        console.error("Teammate verification error:", error);
        setSubmitError(
          "Could not verify teammate details. Run the latest Supabase SQL fix, then try again.",
        );
        return;
      }
      if (eventCounts.some((count) => count >= 2)) {
        setSubmitError("Your teammate has already selected two events and cannot be added to another team event.");
        return;
      }
      setSubmitError(null);
      setStep(4);
      return;
    }

    setStep((s) => Math.min(4, s + 1));
  };

  const toggleEvent = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;

    const seats = seatsFor(id);
    const isFull = seats?.capacity != null && seats.registered_count >= seats.capacity;

    if (
      completingPartner &&
      id === "techtalks" &&
      (seats?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS
    ) {
      setSubmitError(
        "The regular TechTalks teams are full. Bonus TechTalks slots are only for a new TechTalks-only team.",
      );
      return;
    }

    setSelected((current) => {
      const alreadySelected = current.includes(id);
      if (alreadySelected) {
        return current.filter((e) => e !== id);
      }
      if (isFull) return current;

      if (id === "techtalks" && (seats?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS) {
        return [id];
      }
      if (
        event.category === "non-technical" &&
        current.includes("techtalks") &&
        (seatsFor("techtalks")?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS
      ) {
        return current;
      }

      // Selecting a new event in a category replaces whichever event
      // was previously selected in that same category — a participant
      // can only hold one technical + one non-technical slot.
      const withoutSameCategory = current.filter(
        (existingId) => events.find((e) => e.id === existingId)?.category !== event.category,
      );
      return [...withoutSameCategory, id];
    });
  };

  const resetForm = () => {
    setResult(null);
    setStep(1);
    setSelected([]);
    setSubmitError(null);
    setTeammateFieldErrors({});
    setRulesAgreed(false);
    setRulesChecked(false);
    setCompletingPartner(false);
    setLockedCategory(null);
    setReservedTeammate(null);
    setPartner({ fullName: "", registerNumber: "", email: "", phone: "" });
    setTechTalkPartner({ fullName: "", registerNumber: "", email: "", phone: "" });
    setFunFeastPartner({ fullName: "", registerNumber: "", email: "", phone: "" });
    form.reset({
      fullName: "",
      registerNumber: "",
      collegeName: "",
      email: "",
      phone: "",
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    setSubmitError(null);

    let record: Registration;
    try {
      record = completingPartner
        ? await completePartnerRegistration({
            ...values,
            events: selected,
            partnerFullName: partner.fullName,
            partnerRegisterNo: partner.registerNumber,
            partnerEmail: partner.email,
            partnerPhone: partner.phone,
            techTalkPartner,
            funFeastPartner,
          })
        : await createRegistration({
            ...values,
            events: selected,
            techTalkPartner,
            funFeastPartner,
          });
    } catch (error) {
      console.error("Registration Error:", error);
      setSubmitting(false);
      const message =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof error.message === "string"
            ? error.message
            : "Registration failed. Please try again.";
      setSubmitError(message);
      return;
    }

    // Registration succeeded — refresh seat/slot counts so the UI
    // reflects the new numbers without needing a page reload.
    refreshCapacity();

    const confetti = (await import("canvas-confetti")).default;
    const burst = (ratio: number, opts: Record<string, unknown>) =>
      confetti({
        particleCount: Math.floor(220 * ratio),
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#EF4444", "#DC2626", "#7F1D1D", "#FEE2E2"],
        ...opts,
      });
    burst(0.3, { startVelocity: 55, spread: 60 });
    burst(0.4, { spread: 120, decay: 0.91, scalar: 0.9 });
    burst(0.2, { spread: 140, startVelocity: 30, decay: 0.92, scalar: 1.2 });

    setResult(record);
    setSubmitting(false);

    const sendCardAndEmail = async (
      recipient: Registration,
      destination: "primary" | "teammate",
      pending = false,
      teammateComplete = false,
    ) => {
      const blob = await getEntryCardBlob(recipient);
      const card = await uploadEntryCard(recipient.id, blob, destination);
      await sendRegistrationEmail(
        recipient.fullName,
        recipient.email,
        recipient.id,
        card.imageUrl,
        pending,
        teammateComplete,
        card.bucket,
        card.path,
      );
      return card.imageUrl;
    };

    // One recipient failing must never stop email delivery to the rest of a team.
    const deliveryResults = await Promise.allSettled([
      sendCardAndEmail(record, "primary"),
      ...(record.pendingTeammates ?? []).map(async (teammate) => {
        const currentDetails = await getRegistrationCardDetails(teammate.id);
        const fallbackEventPartners = Object.fromEntries(
          teammate.events.map((event) => [event, { fullName: teammate.partnerFullName ?? "" }]),
        );
        const teammateRecord = currentDetails
          ? {
              ...teammate,
              events: currentDetails.events,
              eventPartners: currentDetails.eventPartners ?? fallbackEventPartners,
            }
          : { ...teammate, eventPartners: fallbackEventPartners };
        return sendCardAndEmail(
          teammateRecord,
          "teammate",
          currentDetails?.status === "pending_partner",
          currentDetails?.status === "complete" && currentDetails.events.length === 2,
        );
      }),
    ]);
    const failures = deliveryResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length) {
      console.error("Some card/email deliveries failed:", failures);
      toast.error(
        "Registration is saved, but one or more emails are pending. The coordinator can resend them.",
      );
    }
  };

  if (loadingCapacity) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (false) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-40 pb-10 text-center">
        <span className="glass flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/40">
          <ShieldAlert className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
          Registrations Are Full
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          All {TOTAL_CAP} participant slots for {site.symposium} have been filled. Thank you for
          your interest — please contact the coordinators below for waitlist information.
        </p>
        <div className="glass mt-8 rounded-2xl border border-border p-5 text-sm text-muted-foreground">
          <p>{site.studentCoordinator.name}</p>
          <p className="text-primary">{site.studentCoordinator.phone}</p>
        </div>
      </div>
    );
  }

  // RULES GATE — shown before the 4-step form. Not part of StepProgress.
  if (!rulesAgreed) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-36 pb-10">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-[0.4em] text-primary uppercase">
            {site.symposium}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-5xl">
            <span className="text-aurora">RULES & GUIDELINES</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Please read carefully before you begin registration.
          </p>
        </div>

        <div className="glass mt-10 rounded-3xl border border-border p-6 sm:p-10">
          <div className="max-h-96 space-y-4 overflow-y-auto pr-2">
            {rules.map((rule, i) => (
              <div key={rule} className="flex items-start gap-4">
                <span className="font-display text-xl font-bold text-primary/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>

          <label className="glass mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
            <input
              type="checkbox"
              checked={rulesChecked}
              onChange={(e) => setRulesChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="text-sm text-foreground">
              I have read and understood the rules above. I confirm all information I submit will be
              accurate and that duplicate registrations are not permitted.
            </span>
          </label>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              For clarifications, contact {site.studentCoordinator.name} at{" "}
              <span className="text-primary">{site.studentCoordinator.phone}</span>
            </div>
            <button
              type="button"
              disabled={!rulesChecked}
              onClick={() => setRulesAgreed(true)}
              className="bg-aurora inline-flex shrink-0 items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN 4-STEP FORM — unchanged step numbering/labels (Personal, Contact,
  // Events, Review), only reached after the rules gate above.
  return (
    <div className="mx-auto max-w-4xl px-6 pt-36 pb-10">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.4em] text-primary uppercase">
          {site.symposium}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-5xl">
          <span className="text-aurora">REGISTRATION</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {completingPartner
            ? "Your teammate reserved one event. Choose your remaining event."
            : "One technical event. One non-technical event. Takes under two minutes."}
        </p>
        {totalRegistered != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            {totalRegistered} registrations completed
          </p>
        )}
      </div>

      <div className="mt-12">
        <StepProgress step={step} />
      </div>

      <div className="glass mt-10 rounded-3xl border border-border p-6 sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {step === 1 && (
              <StepShell title="Personal Details" caption="Tell us who is participating.">
                <Field label="Full Name" error={form.formState.errors.fullName?.message}>
                  <input
                    {...form.register("fullName")}
                    placeholder="e.g. Naveen S"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="University Register Number"
                  error={form.formState.errors.registerNumber?.message}
                >
                  <input
                    {...form.register("registerNumber")}
                    placeholder="e.g. 71382204119"
                    className={inputClass}
                  />
                </Field>
                <Field label="College Name" error={form.formState.errors.collegeName?.message}>
                  <input
                    {...form.register("collegeName")}
                    placeholder="e.g. AAMEC"
                    className={inputClass}
                  />
                </Field>
              </StepShell>
            )}

            {step === 2 && (
              <StepShell title="Contact Details" caption="We send your confirmation here.">
                <Field label="Gmail Address" error={form.formState.errors.email?.message}>
                  <input
                    {...form.register("email")}
                    placeholder="you@gmail.com"
                    readOnly={reservedTeammate !== null}
                    className={inputClass}
                  />
                </Field>
                <Field label="Phone Number" error={form.formState.errors.phone?.message}>
                  <input
                    {...form.register("phone")}
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    readOnly={reservedTeammate !== null}
                    className={inputClass}
                  />
                </Field>
              </StepShell>
            )}

            {step === 3 && (
              <StepShell
                title="Choose Events"
                caption={
                  completingPartner
                    ? lockedCategory === "non-technical" &&
                        (seatsFor("techtalks")?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS
                      ? "Choose a technical event other than TechTalks. Bonus TechTalks slots are for new TechTalks-only teams."
                      : "Choose one event from your remaining category."
                    : isTechTalksBonus
                      ? "TechTalks regular teams are full. You can register for TechTalks only."
                      : "Select exactly one technical event and one non-technical event."
                }
              >
                {capacityError && (
                  <p className="text-xs text-destructive">
                    Couldn't load live seat counts — you can still register, availability will be
                    confirmed on submission.
                  </p>
                )}

                {!isTechTalksBonus && <EventGroup
                  label="Technical"
                  categoryEvents={events.filter(
                    (e) =>
                      e.category === "technical" &&
                      (!completingPartner || lockedCategory !== "technical") &&
                      !(
                        completingPartner &&
                        e.id === "techtalks" &&
                        (seatsFor("techtalks")?.registered_count ?? 0) >= TECHTALKS_REGULAR_SEATS
                      ),
                  )}
                  selectedId={selectedTechnical}
                  seatsFor={seatsFor}
                  onToggle={toggleEvent}
                />}
                <EventGroup
                  label="Non-Technical"
                  categoryEvents={events.filter(
                    (e) =>
                      e.category === "non-technical" &&
                      (!completingPartner || lockedCategory !== "non-technical"),
                  )}
                  selectedId={selectedNonTechnical}
                  seatsFor={seatsFor}
                  onToggle={toggleEvent}
                />

                <p
                  className={cn(
                    "mt-2 text-xs",
                    eventsComplete ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {eventsComplete
                    ? isTechTalksBonus
                      ? "TechTalks-only bonus team selected."
                      : "Both events selected."
                    : `Select ${REQUIRED_EVENTS} events — one technical, one non-technical.`}
                </p>

                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.map((id) => {
                      const event = events.find((e) => e.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-foreground"
                        >
                          {event?.name}
                          <button
                            type="button"
                            aria-label={`Remove ${event?.name}`}
                            onClick={() => toggleEvent(id)}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {selectedDuo && (
                  <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <p className="mb-2 text-sm font-semibold text-foreground">
                      {completingPartner
                        ? "Teammate details"
                        : selected.includes("techtalks")
                          ? "TechTalks teammate details"
                          : selected.includes("nexus")
                            ? "Nexus teammate details"
                            : "Fun Feast teammate details"}
                    </p>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Their event seat is reserved now. They return later with these contact details
                      to choose their remaining event.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["fullName", "Full name"],
                          ["registerNumber", "University register number"],
                          ["email", "Gmail address"],
                          ["phone", "10-digit phone number"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="block text-xs tracking-widest text-muted-foreground uppercase"
                        >
                          {label}
                          <input
                            value={primaryTeammate[key]}
                            onChange={(event) =>
                              (completingPartner
                                ? setPartner
                                : selected.includes("techtalks")
                                  ? setTechTalkPartner
                                  : setFunFeastPartner)((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                            onBlur={() => {
                              const error = teammateFieldError(key, primaryTeammate[key], values);
                              setTeammateFieldErrors((current) => ({
                                ...current,
                                [`${primaryTeammateKey}.${key}`]: error ?? "",
                              }));
                            }}
                            className={cn(
                              `${inputClass} mt-2`,
                              teammateFieldErrors[`${primaryTeammateKey}.${key}`] && "border-destructive",
                            )}
                          />
                          {teammateFieldErrors[`${primaryTeammateKey}.${key}`] && (
                            <span className="mt-1 block normal-case text-xs tracking-normal text-destructive">
                              {teammateFieldErrors[`${primaryTeammateKey}.${key}`]}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {!completingPartner &&
                  selected.includes("techtalks") &&
                  (selected.includes("fun-feast") || selected.includes("nexus")) && (
                    <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <p className="mb-2 text-sm font-semibold text-foreground">
                        {selected.includes("nexus")
                          ? "Nexus teammate details"
                          : "Fun Feast teammate details"}
                      </p>
                      <p className="mb-4 text-xs text-muted-foreground">
                        This can be a different teammate from TechTalks.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["fullName", "Full name"],
                            ["registerNumber", "University register number"],
                            ["email", "Gmail address"],
                            ["phone", "10-digit phone number"],
                          ] as const
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="block text-xs tracking-widest text-muted-foreground uppercase"
                          >
                            {label}
                            <input
                              value={funFeastPartner[key]}
                              onChange={(event) =>
                                setFunFeastPartner((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                const error = teammateFieldError(key, funFeastPartner[key], values);
                                setTeammateFieldErrors((current) => ({
                                  ...current,
                                  [`funFeastPartner.${key}`]: error ?? "",
                                }));
                              }}
                              className={cn(
                                `${inputClass} mt-2`,
                                teammateFieldErrors[`funFeastPartner.${key}`] && "border-destructive",
                              )}
                            />
                            {teammateFieldErrors[`funFeastPartner.${key}`] && (
                              <span className="mt-1 block normal-case text-xs tracking-normal text-destructive">
                                {teammateFieldErrors[`funFeastPartner.${key}`]}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                {submitError && (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {submitError}
                  </p>
                )}
              </StepShell>
            )}

            {step === 4 && (
              <StepShell title="Review" caption="Check everything before confirming.">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Full Name" value={values.fullName} />
                  <Summary label="Register Number" value={values.registerNumber} />
                  <Summary label="College" value={values.collegeName} />
                  <Summary label="Gmail" value={values.email} />
                  <Summary label="Phone Number" value={values.phone} />
                  {selected.map((id) => {
                    const event = events.find((e) => e.id === id);
                    const teammateName = completingPartner && selectedDuo
                      ? partner.fullName
                      : id === "techtalks"
                        ? techTalkPartner.fullName
                        : id === "fun-feast" || id === "nexus"
                          ? funFeastPartner.fullName
                          : null;
                    return (
                      <Summary
                        key={id}
                        label={
                          event?.category === "technical"
                            ? "Technical Event"
                            : "Non-Technical Event"
                        }
                        value={
                          teammateName
                            ? `${event?.name ?? id} · Team: ${teammateName}`
                            : (event?.name ?? id)
                        }
                      />
                    );
                  })}
                </dl>

                {submitError && (
                  <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {submitError}
                  </p>
                )}
              </StepShell>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="glass inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-foreground transition-transform hover:scale-105"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 4 ? "Edit" : "Previous"}
            </button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              disabled={checking || (step === 3 && !eventsComplete)}
              className="bg-aurora inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="bg-aurora glow-cyan inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm Registration
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {result && <SuccessDialog registration={result} onDone={resetForm} />}
      </AnimatePresence>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-input bg-secondary/40 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70";

function StepShell({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

function EventGroup({
  label,
  categoryEvents,
  selectedId,
  seatsFor,
  onToggle,
}: {
  label: string;
  categoryEvents: typeof events;
  selectedId: string | undefined;
  seatsFor: (slug: string) => EventCapacityRow | undefined;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {categoryEvents.map((event) => {
          const active = selectedId === event.id;
          const seats = seatsFor(event.id);
          const isFull = seats?.capacity != null && seats.registered_count >= seats.capacity;
          const seatsLeftLabel =
            seats?.capacity != null ? `${seats.seats_remaining ?? 0} seats left` : null;

          return (
            <button
              key={event.id}
              type="button"
              disabled={!active && isFull}
              onClick={() => onToggle(event.id)}
              className={cn(
                "flex items-start gap-4 rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-primary/70 bg-primary/10 glow-cyan"
                  : "border-border bg-secondary/30 hover:border-foreground/30",
                !active && isFull && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <EventIcon name={event.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{event.name}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {event.teamSize}
                  {seatsLeftLabel && (
                    <span className={cn("ml-2", isFull ? "text-destructive" : "text-primary")}>
                      {isFull ? "FULL" : seatsLeftLabel}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SuccessDialog({
  registration,
  onDone,
}: {
  registration: Registration;
  onDone: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="glass glow-cyan w-full max-w-md rounded-3xl border border-primary/40 p-8 text-center"
      >
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 14 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10"
        >
          <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </motion.span>

        <h2 className="mt-6 font-display text-2xl font-bold text-aurora">
          Registration Successful
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Thank you for registering. A confirmation email will be sent shortly.
        </p>
        <p className="mt-4 inline-block rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
          Receipt ID · {registration.id}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => downloadEntryCard(registration)}
            className="bg-aurora inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Download className="h-4 w-4" /> Download Registration Receipt
          </button>
          <button
            type="button"
            onClick={onDone}
            className="glass inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-foreground transition-transform hover:scale-[1.02]"
          >
            <Home className="h-4 w-4" /> Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
