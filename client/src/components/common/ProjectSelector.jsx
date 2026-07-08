import { useSearchParams } from "react-router-dom";
import { Autocomplete, TextField } from "@mui/material";
import { useProjectContext } from "../../context/ProjectContext";

const ALL_PROJECTS_OPTION = { id: null, code: "", name: "全部项目" };

/**
 * Global project selector using MUI Autocomplete.
 * Reads/writes ?projectId in the URL search params.
 * Consumes project list from ProjectContext.
 *
 * Props:
 *   label  — TextField label (default "项目")
 *   size   — "small" | "medium" (default "small")
 */
export default function ProjectSelector({ label = "项目", size = "small" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { projects, loading } = useProjectContext();

  const projectId = searchParams.get("projectId") || null;
  const currentProject = projectId
    ? projects.find((p) => String(p.id) === projectId) || null
    : null;

  const options = [ALL_PROJECTS_OPTION, ...projects];

  return (
    <Autocomplete
      size={size}
      options={options}
      loading={loading}
      getOptionLabel={(opt) =>
        opt.id === null ? "全部项目" : `[${opt.code}] ${opt.name}`
      }
      isOptionEqualToValue={(opt, val) => opt.id === val?.id}
      value={currentProject || ALL_PROJECTS_OPTION}
      onChange={(_, newVal) => {
        if (newVal && newVal.id !== null) {
          setSearchParams({ projectId: String(newVal.id) });
        } else {
          setSearchParams({});
        }
      }}
      sx={{ minWidth: 260 }}
      renderInput={(params) => <TextField {...params} label={label} />}
      disableClearable
    />
  );
}
