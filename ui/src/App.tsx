import React, { useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { createDockerDesktopClient } from "@docker/extension-api-client";
import {
  Stack,
  Button,
  Typography,
  Box,
  LinearProgress,
  Badge,
  Tooltip,
} from "@mui/material";

// Note: This line relies on Docker Desktop's presence as a host application.
// If you're running this React app in a browser, it won't work properly.
const client = createDockerDesktopClient();

function useDockerDesktopClient() {
  return client;
}

export function App() {
  const [rows, setRows] = React.useState([]);
  const [exportPath, setExportPath] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const ddClient = useDockerDesktopClient();

  const columns = [
    { field: "id", headerName: "ID", width: 70, hide: true },
    { field: "volumeDriver", headerName: "Driver", width: 70 },
    {
      field: "volumeName",
      headerName: "Volume name",
      width: 320,
      renderCell: (params) => {
        return params.row.volumeLinks > 0 ? (
          <Tooltip
            title={`In use by ${params.row.volumeLinks} container(s)`}
            placeholder="right"
          >
            <Badge
              badgeContent={params.row.volumeLinks}
              color="primary"
              anchorOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
            >
              <Box m={0.5}>{params.row.volumeName}</Box>
            </Badge>
          </Tooltip>
        ) : (
          <Box m={0.5}>{params.row.volumeName}</Box>
        );
      },
    },
    { field: "volumeLinks", hide: true },
    { field: "volumeMountPoint", headerName: "Mount point", width: 260 },
    { field: "volumeSize", headerName: "Size", width: 130 },
    {
      field: "export",
      headerName: "Action",
      width: 130,
      sortable: false,
      renderCell: (params) => {
        const onClick = (e) => {
          e.stopPropagation(); // don't select this row after clicking
          exportVolume(params.row.volumeName);
        };

        return (
          <Button
            variant="contained"
            onClick={onClick}
            disabled={exportPath === "" || loading}
          >
            Export
          </Button>
        );
      },
    },
  ];

  useEffect(() => {
    const listVolumes = async () => {
      const result = await ddClient.docker.cli.exec("system", [
        "df",
        "-v",
        "--format",
        "'{{ json .Volumes }}'",
      ]);

      if (result.stderr !== "") {
        ddClient.desktopUI.toast.error(result.stderr);
      } else {
        const volumes = result.parseJsonObject();
        const rows = volumes
          .sort((a, b) => a.Name.localeCompare(b.Name))
          .map((volume, index) => {
            return {
              id: index,
              volumeDriver: volume.Driver,
              volumeName: volume.Name,
              volumeLinks: volume.Links,
              volumeMountPoint: volume.Mountpoint,
              volumeSize: volume.Size,
            };
          });

        setRows(rows);
      }
    };

    listVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run it once, only when component is mounted

  const selectExportDirectory = () => {
    ddClient.desktopUI.dialog
      .showOpenDialog({ properties: ["openDirectory"] })
      .then((result) => {
        if (result.canceled) {
          return;
        }

        setExportPath(result.filePaths[0]);
      });
  };

  const exportVolume = async (volumeName: string) => {
    setLoading(true);

    try {
      const output = await ddClient.docker.cli.exec("run", [
        "--rm",
        `-v=${volumeName}:/vackup-volume `,
        `-v=${exportPath}:/vackup `,
        "busybox",
        "tar",
        "-zcvf",
        `/vackup/${volumeName}.tar.gz`,
        "/vackup-volume",
      ]);
      console.log(output);
      if (output.stderr !== "") {
        //"tar: removing leading '/' from member names\n"
        if (!output.stderr.includes("tar: removing leading")) {
          // this is an error we may want to display
          ddClient.desktopUI.toast.error(output.stderr);
          return;
        }
      }
      ddClient.desktopUI.toast.success(
        `Volume ${volumeName} exported to ${exportPath}`
      );
    } catch (error) {
      console.error(error);
      ddClient.desktopUI.toast.error(
        `Failed to backup volume ${volumeName} to ${exportPath}: ${error.code}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h3">Vackup Extension</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
        Easily backup and restore docker volumes.
      </Typography>
      <Stack direction="column" alignItems="start" spacing={2} sx={{ mt: 4 }}>
        <Button
          variant="contained"
          onClick={selectExportDirectory}
          disabled={loading}
        >
          Choose path
        </Button>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          {exportPath}
        </Typography>
        {loading && (
          <Box sx={{ width: "100%" }}>
            <LinearProgress />
          </Box>
        )}

        <div style={{ height: 400, width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={5}
            rowsPerPageOptions={[5]}
            checkboxSelection={false}
            disableSelectionOnClick={true}
          />
        </div>
      </Stack>
    </>
  );
}
