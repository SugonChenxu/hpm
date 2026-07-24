import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import { parseMaterialExcel, parseRequirementExcel } from "../../utils/materialExcel";
import { statusStyle } from "../../utils/materialStatus";

const PREVIEW_FIELDS = [
  { key: "part_number", label: "物料号" },
  { key: "manufacturer", label: "厂家" },
  { key: "model", label: "物料型号" },
  { key: "material_status", label: "物料状态" },
  { key: "quantity", label: "数量" },
  { key: "purchase_date", label: "采购时间" },
  { key: "lead_time", label: "采购周期" },
  { key: "expected_delivery", label: "预计交期" },
  { key: "notes", label: "备注" },
];

const REQ_PREVIEW_FIELDS = [
  { key: "module", label: "模块" },
  { key: "description", label: "物料描述" },
  { key: "part_number", label: "物料号" },
  { key: "estimated_price", label: "预估单价" },
  { key: "quantity", label: "数量" },
  { key: "material_status", label: "物料状态" },
  { key: "oa_link", label: "OA链接" },
  { key: "notes", label: "备注" },
];

export default function MaterialImportDialog({ open, file, projectId, mode = "purchase", onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isReq = mode === "requirement";
  const previewFields = isReq ? REQ_PREVIEW_FIELDS : PREVIEW_FIELDS;

  useEffect(() => {
    if (!open || !file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    (isReq ? parseRequirementExcel(file) : parseMaterialExcel(file))
      .then((res) => setResult(res))
      .catch((e) => setError(e.message || "解析失败"))
      .finally(() => setLoading(false));
  }, [open, file, isReq]);

  const handleConfirm = async () => {
    if (!result || !result.items.length) return;
    setSubmitting(true);
    try {
      const endpoint = isReq ? "/api/requirements/batch" : "/api/materials/batch";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: Number(projectId), items: result.items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "导入失败");
      onConfirmed(json.data.count);
    } catch (e) {
      setError(e.message || "导入失败");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>导入 Excel 预览（{isReq ? "需求清单" : "采购清单"}）</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4 }}>
            <CircularProgress size={24} />
            <Typography>正在解析文件…</Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && result && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              已识别 {result.items.length} 行数据（预览前 {result.preview.length} 行）。
              {result.unmatched.length > 0 &&
                ` 未匹配列：${result.unmatched.join("、")}（已忽略，不影响导入）。`}
            </Alert>

            {result.errors.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                发现 {result.errors.length} 处数据问题（已自动容错为 0 / 默认值）：
                <Box component="div" sx={{ mt: 0.5, maxHeight: 120, overflow: "auto", fontSize: "0.8rem" }}>
                  {result.errors.slice(0, 20).map((e, i) => (
                    <div key={i}>
                      第 {e.row} 行 · {e.message}
                    </div>
                  ))}
                  {result.errors.length > 20 && <div>…共 {result.errors.length} 处</div>}
                </Box>
              </Alert>
            )}

            <TableContainer component={Paper} sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    {previewFields.map((f) => (
                      <TableCell key={f.key}>{f.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      {previewFields.map((f) => (
                        <TableCell key={f.key}>
                          {f.key === "material_status" ? (
                            <Chip
                              label={row.material_status}
                              size="small"
                              sx={{
                                color: statusStyle(row.material_status).color,
                                bgcolor: statusStyle(row.material_status).bg,
                                fontWeight: 600,
                              }}
                            />
                          ) : (
                            String(row[f.key] ?? "")
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || submitting || !result || result.items.length === 0}
        >
          {submitting ? "导入中…" : `确认导入 ${result ? result.items.length : 0} 行`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
