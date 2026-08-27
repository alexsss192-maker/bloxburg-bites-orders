import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/staff/bulk-pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Bulk Pricing — Panda Bites Staff" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffBulkPricingPage,
});

type BulkServiceFee = {
  id: string;
  fee_value: number;
  fee_type: "fixed" | "percentage";
  fee_message: string | null;
  is_active: boolean;
  created_at: string;
};

function StaffBulkPricingPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<BulkServiceFee[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    fee_value: "",
    fee_type: "fixed" as "fixed" | "percentage",
    fee_message: "",
    is_active: true,
  });

  // Check admin status on mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const hasAdmin = (roles ?? []).some(
          (r) => r.role === "admin",
        );
        setIsAdmin(hasAdmin);

        if (hasAdmin) {
          await loadFees();
        }
      } catch (err) {
        console.error("Admin check failed:", err);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  async function loadFees() {
    try {
      const { data, error } = await supabase
        .from("bulk_service_fees")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFees((data ?? []) as BulkServiceFee[]);
    } catch (err) {
      toast.error("Failed to load bulk pricing fees");
      console.error(err);
    }
  }

  async function handleAddFee(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.fee_value) {
      toast.error("Enter a fee value");
      return;
    }

    const feeValue = parseFloat(formData.fee_value);
    if (isNaN(feeValue) || feeValue <= 0) {
      toast.error("Fee value must be greater than 0");
      return;
    }

    if (
      formData.fee_type === "percentage" &&
      feeValue > 100
    ) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("bulk_service_fees")
        .insert({
          fee_value: feeValue,
          fee_type: formData.fee_type,
          fee_message: formData.fee_message || null,
          is_active: formData.is_active,
        });

      if (error) throw error;

      toast.success("Bulk service fee added");
      setFormData({
        fee_value: "",
        fee_type: "fixed",
        fee_message: "",
        is_active: true,
      });
      await loadFees();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to add fee",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFee(id: string) {
    if (
      !confirm(
        "Delete this bulk service fee? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("bulk_service_fees")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Fee deleted");
      await loadFees();
    } catch (err) {
      toast.error("Failed to delete fee");
    }
  }

  async function handleToggleFee(
    id: string,
    isActive: boolean,
  ) {
    try {
      const { error } = await supabase
        .from("bulk_service_fees")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) throw error;

      toast.success(
        !isActive
          ? "Fee enabled"
          : "Fee disabled",
      );
      await loadFees();
    } catch (err) {
      toast.error("Failed to update fee");
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-cherry" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-lg font-semibold text-cherry">
          Admin only
        </p>
        <p className="mt-2 text-ink/60">
          Only administrators can manage bulk
          service pricing.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl">
          Bulk / Fast Service Pricing
        </h1>
        <p className="mt-2 text-ink/60">
          Set pricing for orders that qualify as bulk
          (2+ trays / 42+ items). Customers choose
          between normal delivery and fast service.
        </p>
      </div>

      {/* Add New Fee Form */}
      <div className="mb-8 rounded-2xl border border-border/60 bg-white p-6">
        <h2 className="font-display text-xl">
          Add new fast service fee
        </h2>

        <form onSubmit={handleAddFee} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fee_value">
                Fee amount
              </Label>
              <Input
                id="fee_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 5000"
                value={formData.fee_value}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fee_value: e.target.value,
                  })
                }
                className="mt-2"
              />
              <p className="mt-1 text-xs text-ink/50">
                Enter the amount in B$
              </p>
            </div>

            <div>
              <Label htmlFor="fee_type">
                Fee type
              </Label>
              <select
                id="fee_type"
                value={formData.fee_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fee_type: e.target.value as
                      | "fixed"
                      | "percentage",
                  })
                }
                className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-4 text-sm"
              >
                <option value="fixed">
                  Fixed amount
                </option>
                <option value="percentage">
                  Percentage of order
                </option>
              </select>
              <p className="mt-1 text-xs text-ink/50">
                {formData.fee_type === "fixed"
                  ? "Flat B$ charge"
                  : "% of order subtotal"}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="fee_message">
              Customer message (optional)
            </Label>
            <Textarea
              id="fee_message"
              placeholder="Why this fee? Shown to customers on checkout..."
              value={formData.fee_message}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  fee_message: e.target.value,
                })
              }
              className="mt-2"
              rows={3}
            />
            <p className="mt-1 text-xs text-ink/50">
              Explain the fee to customers
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-blossom/30 px-4 py-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  is_active: e.target.checked,
                })
              }
              className="h-4 w-4"
            />
            <label htmlFor="is_active" className="text-sm">
              Enable this fee immediately
            </label>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding fee…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add fast service fee
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Current Fees List */}
      <div>
        <h2 className="font-display text-xl">
          Active & inactive fees
        </h2>

        {fees.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-white p-8 text-center">
            <p className="text-ink/60">
              No bulk service fees added yet.
            </p>
            <p className="mt-1 text-sm text-ink/50">
              Add one above to enable customers to
              choose fast service.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60 bg-white">
            {fees.map((fee) => (
              <div
                key={fee.id}
                className="flex items-center justify-between gap-4 p-4 sm:p-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold">
                      {fee.fee_type ===
                      "fixed"
                        ? `B$${fee.fee_value.toLocaleString()}`
                        : `${fee.fee_value}%`}
                    </p>
                    <span className="text-xs uppercase tracking-widest text-ink/50">
                      {fee.fee_type === "fixed"
                        ? "Fixed"
                        : "Percentage"}
                    </span>
                    {!fee.is_active && (
                      <span className="text-xs uppercase tracking-widest text-ink/40">
                        Disabled
                      </span>
                    )}
                  </div>

                  {fee.fee_message && (
                    <p className="mt-2 text-sm text-ink/70">
                      "{fee.fee_message}"
                    </p>
                  )}

                  <p className="mt-1 text-xs text-ink/40">
                    Added{" "}
                    {new Date(
                      fee.created_at,
                    ).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      handleToggleFee(
                        fee.id,
                        fee.is_active,
                      )
                    }
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium transition hover:bg-blossom"
                  >
                    {fee.is_active
                      ? "Disable"
                      : "Enable"}
                  </button>

                  <button
                    onClick={() =>
                      handleDeleteFee(fee.id)
                    }
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-12 rounded-2xl border border-cherry/20 bg-cherry/5 p-6">
        <h3 className="font-display text-lg text-cherry">
          How this works
        </h3>

        <ul className="mt-4 space-y-3 text-sm text-ink/70">
          <li className="flex gap-3">
            <span className="font-semibold text-cherry">
              1.
            </span>
            <span>
              Orders with 2+ trays (42+ items) are
              flagged as bulk.
            </span>
          </li>

          <li className="flex gap-3">
            <span className="font-semibold text-cherry">
              2.
            </span>
            <span>
              Cart drawer shows a bulk warning with
              two options: order with or without
              fast service.
            </span>
          </li>

          <li className="flex gap-3">
            <span className="font-semibold text-cherry">
              3.
            </span>
            <span>
              Both routes deliver to the same bulk
              chef, but fast service gets priority
              processing.
            </span>
          </li>

          <li className="flex gap-3">
            <span className="font-semibold text-cherry">
              4.
            </span>
            <span>
              Your fee (fixed or %) is added only
              if customer chooses fast service.
            </span>
          </li>

          <li className="flex gap-3">
            <span className="font-semibold text-cherry">
              5.
            </span>
            <span>
              Message shown on checkout to explain
              the fee to customers.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
