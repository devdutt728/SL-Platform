"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { apiFetch } from "@/lib/api";
import type { Category, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const schema = z.object({
  subject: z.string().min(3),
  description: z.string().min(3),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

type FormValues = z.infer<typeof schema>;

const priorityMatrix: Record<string, string> = {
  "HIGH|HIGH": "P0",
  "HIGH|MEDIUM": "P1",
  "MEDIUM|HIGH": "P1",
  "MEDIUM|MEDIUM": "P2",
  "LOW|HIGH": "P2",
  "LOW|MEDIUM": "P3",
  "LOW|LOW": "P3",
};

export function TicketCreateForm() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      impact: "MEDIUM",
      urgency: "MEDIUM",
    },
  });

  const impact = watch("impact");
  const urgency = watch("urgency");
  const categoryId = watch("category_id");

  const suggestedPriority = useMemo(() => {
    return priorityMatrix[`${impact}|${urgency}`] || "P3";
  }, [impact, urgency]);

  useEffect(() => {
    apiFetch<Category[]>("/it/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    apiFetch<Subcategory[]>(`/it/subcategories?category_id=${categoryId}`)
      .then(setSubcategories)
      .catch(() => setSubcategories([]));
  }, [categoryId]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await apiFetch("/it/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: values.subject,
          description: values.description,
          category_id: values.category_id ? Number(values.category_id) : null,
          subcategory_id: values.subcategory_id ? Number(values.subcategory_id) : null,
          impact: values.impact,
          urgency: values.urgency,
        }),
      });
      reset();
      alert("Ticket created successfully.");
    } catch (error) {
      alert("Unable to create ticket. Please check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="text-sm font-semibold" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          className={cn(
            "mt-2 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3",
            errors.subject && "border-lotus"
          )}
          placeholder="e.g., Laptop not booting"
          {...register("subject")}
        />
        {errors.subject && <p className="mt-1 text-xs text-lotus">Subject is required.</p>}
      </div>

      <div>
        <label className="text-sm font-semibold" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className={cn(
            "mt-2 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 min-h-[120px]",
            errors.description && "border-lotus"
          )}
          placeholder="Add clear steps, error messages, and any recent changes."
          {...register("description")}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-lotus">Description is required.</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3"
            {...register("category_id")}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.category_id} value={category.category_id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="subcategory">
            Subcategory
          </label>
          <select
            id="subcategory"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3"
            {...register("subcategory_id")}
          >
            <option value="">Select a subcategory</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.subcategory_id} value={subcategory.subcategory_id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">Impact</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {["HIGH", "MEDIUM", "LOW"].map((value) => (
              <label key={value} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-3 py-2">
                <input type="radio" value={value} {...register("impact")} />
                <span className="text-sm">{value}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold">Urgency</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {["HIGH", "MEDIUM", "LOW"].map((value) => (
              <label key={value} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-3 py-2">
                <input type="radio" value={value} {...register("urgency")} />
                <span className="text-sm">{value}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-5 py-4">
        <div className="text-sm text-steel">Suggested priority</div>
        <div className="text-xl font-semibold text-ink">{suggestedPriority}</div>
        <p className="text-xs text-steel mt-1">Priority is based on impact and urgency.</p>
      </div>

      <div>
        <label className="text-sm font-semibold" htmlFor="attachments">
          Attachments
        </label>
        <input
          id="attachments"
          type="file"
          multiple
          className="mt-2 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3"
        />
        <p className="mt-1 text-xs text-steel">
          You can also add files later from the ticket detail page.
        </p>
      </div>

      <button
        type="submit"
        className="px-6 py-3 rounded-full bg-brand text-white font-semibold"
        disabled={submitting}
      >
        {submitting ? "Submitting..." : "Create ticket"}
      </button>
    </form>
  );
}
