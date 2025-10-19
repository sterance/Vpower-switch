import { CssBaseline, ThemeProvider, createTheme, Container, AppBar, Toolbar, Typography, Box, Stack, IconButton } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import AddIcon from '@mui/icons-material/Add'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { useState } from 'react'
import MachinesPanel from './components/MachinesPanel'
import Notifications from './components/Notifications'

function App() {
  const [mode, setMode] = useState('dark')
  const theme = createTheme({ palette: { mode } })
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' })
  const [refreshKey, setRefreshKey] = useState(0)
  const [openAddKey, setOpenAddKey] = useState(0)
  const notify = (message, severity = 'info') => setSnack({ open: true, message, severity })
  const closeSnack = () => setSnack(s => ({ ...s, open: false }))
  const triggerRefresh = () => setRefreshKey(k => k + 1)
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static">
      <Toolbar sx={{ justifyContent: 'space-between', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          <IconButton
            color="inherit"
            aria-label="refresh"
            onClick={triggerRefresh}
          >
            <RefreshIcon />
          </IconButton>
          <IconButton
            color="inherit"
            aria-label="add"
            onClick={() => setOpenAddKey(k => k + 1)}
            sx={{ width: 100, height: 100 }}
          >
            <AddIcon sx={{ fontSize: 60 }} />
          </IconButton>
          <IconButton
            color="inherit"
            aria-label="toggle theme"
            onClick={() => setMode(m => (m === 'light' ? 'dark' : 'light'))}
          >
            {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ mt: 3, mb: 4 }}>
          <Stack spacing={3}>
            <MachinesPanel
              onNotify={notify}
              refreshKey={refreshKey}
              openAddKey={openAddKey}
              onRefresh={triggerRefresh}
            />
          </Stack>
        </Box>
      </Container>
      <Notifications
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={closeSnack}
      />
    </ThemeProvider>
  )
}

export default App