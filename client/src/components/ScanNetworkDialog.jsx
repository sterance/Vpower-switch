import { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemButton, ListItemText, CircularProgress, Stack, Typography, Alert, Box } from '@mui/material'
import ComputerIcon from '@mui/icons-material/Computer'
import client from '../api/client'

function ScanNetworkDialog({ open, onClose, onSelect }) {
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      startScan()
    }
  }, [open])

  const startScan = async () => {
    setScanning(true)
    setError('')
    setDevices([])
    try {
      const res = await client.get('/scan')
      setDevices(res.data || [])
      if (!res.data || res.data.length === 0) {
        setError('No machines found on network')
      }
    } catch (e) {
      setError('Failed to scan network')
    } finally {
      setScanning(false)
    }
  }

  const handleSelect = (device) => {
    // use setTimeout to ensure proper focus management
    setTimeout(() => {
      onSelect(device)
      onClose()
    }, 0)
  }

  const renderOSIcon = (os) => {
    const iconStyle = {
      width: 24,
      height: 24,
      filter: 'grayscale(100%) brightness(0.7)',
      marginRight: 16
    }

    switch (os?.toLowerCase()) {
      case 'windows':
        return <img src="/windows.png" alt="Windows" style={iconStyle} />
      case 'linux':
        return <img src="/linux.png" alt="Linux" style={iconStyle} />
      default:
        return <ComputerIcon sx={{ mr: 2, color: 'primary.main' }} />
    }
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      disableEnforceFocus
      disableRestoreFocus
    >
      <DialogTitle>Scan network</DialogTitle>
      <DialogContent>
        {scanning && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Scanning local network for machines...
            </Typography>
          </Stack>
        )}
        {!scanning && error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {!scanning && devices.length > 0 && (
          <List sx={{ mt: 1 }}>
            {devices.map((device, idx) => (
              <ListItem key={idx} disablePadding>
                <ListItemButton onClick={() => handleSelect(device)}>
                  {renderOSIcon(device.os)}
                  <ListItemText
                    secondary={
                      <>
                        <Typography component="span" variant="body2" display="block">
                          IP: {device.ip}
                        </Typography>
                        <Typography component="span" variant="body2" display="block">
                          MAC: {device.mac}
                        </Typography>
                      </>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={startScan} disabled={scanning}>
          Rescan
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default ScanNetworkDialog