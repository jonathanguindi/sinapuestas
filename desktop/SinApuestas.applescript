-- SinApuestas — app de macOS para bloquear las casas de apuestas.
-- Doble clic → consentimiento → modo y duración → un solo cuadro nativo de
-- administrador. Sin Terminal.

property appDir : "/Library/Application Support/SinApuestas"

on resourcesDir()
	set p to POSIX path of (path to resource "blocker.sh")
	return do shell script "dirname " & quoted form of p
end resourcesDir

-- Lee el estado sin pedir contraseña. Devuelve {installed, daysLeft, mode}.
on readState()
	set out to do shell script "cat " & quoted form of (appDir & "/state") & " 2>/dev/null || true"
	if out does not contain "PROTECTION_ON=1" then return {false, 0, "custodio"}
	set lockLine to do shell script "awk -F= '/LOCK_UNTIL/{print $2}' " & quoted form of (appDir & "/state") & " 2>/dev/null || echo 0"
	set daysLeft to (do shell script "echo $(( ( " & lockLine & " - $(date +%s) + 86399) / 86400 ))") as integer
	if daysLeft < 0 then set daysLeft to 0
	set theMode to do shell script "awk -F= '/MODE/{print $2}' " & quoted form of (appDir & "/state") & " 2>/dev/null || echo custodio"
	if theMode is "" then set theMode to "custodio"
	return {true, daysLeft, theMode}
end readState

-- Escribe la contraseña a un archivo temporal 600 sin exponerla en procesos.
on writePasswordTemp(pw)
	set pwPath to do shell script "mktemp /tmp/sa.XXXXXX"
	set fref to (open for access (POSIX file pwPath) with write permission)
	try
		set eof of fref to 0
		write pw to fref as «class utf8»
	end try
	close access fref
	do shell script "chmod 600 " & quoted form of pwPath
	return pwPath
end writePasswordTemp

on askPassword(prompt)
	set d to display dialog prompt default answer "" with hidden answer buttons {"Cancelar", "Continuar"} default button "Continuar" with title "SinApuestas"
	return text returned of d
end askPassword

on chooseDays()
	set opts to {"7 días", "30 días", "90 días", "1 año"}
	set c to choose from list opts with title "SinApuestas" with prompt "¿Por cuánto tiempo? Durante este tiempo NO se podrá quitar, pase lo que pase." default items {"30 días"} without empty selection allowed
	if c is false then return -1
	set v to item 1 of c
	if v is "7 días" then return 7
	if v is "30 días" then return 30
	if v is "90 días" then return 90
	return 365
end chooseDays

on doInstall()
	set resDir to resourcesDir()

	-- Consentimiento informado (obligatorio, botón seguro por defecto = Cancelar).
	display dialog "⚠️  LEE ESTO CON CALMA" & return & return & "Vas a bloquear las casas de apuestas en ESTA computadora." & return & return & "Durante el tiempo que elijas será IMPOSIBLE quitarlo: ni tú, ni con trucos. Es un candado de verdad, pensado para protegerte en los momentos débiles." buttons {"Cancelar", "Entiendo y sigo"} default button "Cancelar" cancel button "Cancelar" with title "SinApuestas" with icon caution

	-- Modo de protección.
	set modeOpts to {"Código secreto automático (recomendado)", "Que otra persona ponga la clave"}
	set mc to choose from list modeOpts with title "SinApuestas" with prompt "¿Cómo quieres cerrar el candado?" & return & return & "• Código secreto: la app genera una clave al azar que NADIE verá; el candado se abre solo cuando termine el tiempo." & return & "• Otra persona: alguien de confianza pone una clave y podría abrirlo antes solo con ella." default items {"Código secreto automático (recomendado)"} without empty selection allowed
	if mc is false then return
	if (item 1 of mc) starts with "Código secreto" then
		set theMode to "aleatorio"
	else
		set theMode to "custodio"
	end if

	set daysNum to chooseDays()
	if daysNum is -1 then return

	set pwPath to "EMPTY"
	if theMode is "custodio" then
		set pw1 to askPassword("Que la escriba otra persona de confianza." & return & "Contraseña de custodio:")
		if pw1 is "" then error "La contraseña no puede estar vacía."
		set pw2 to askPassword("Repite la contraseña de custodio:")
		if pw1 is not equal to pw2 then error "Las contraseñas no coinciden."
		set pwPath to writePasswordTemp(pw1)
	end if

	-- Confirmación final.
	if theMode is "aleatorio" then
		set warn to "Nadie tendrá la clave. NO se podrá abrir hasta que pasen " & (daysNum as text) & " días."
	else
		set warn to "Solo con la contraseña de custodio se podrá abrir, y únicamente después de " & (daysNum as text) & " días."
	end if
	display dialog "Última confirmación." & return & return & warn & return & return & "¿Cerramos el candado ahora?" buttons {"Cancelar", "Sí, activar candado"} default button "Cancelar" cancel button "Cancelar" with title "SinApuestas" with icon caution

	try
		do shell script "/bin/bash " & quoted form of (resDir & "/install-app.sh") & " " & quoted form of resDir & " " & quoted form of pwPath & " " & (daysNum as text) & " " & theMode with administrator privileges
	on error errMsg
		if pwPath is not "EMPTY" then do shell script "rm -f " & quoted form of pwPath
		error "No se pudo instalar: " & errMsg
	end try

	display dialog "✓ Candado activo 🛡️" & return & return & "Las casas de apuestas quedaron bloqueadas por " & (daysNum as text) & " días, y el vigilante arranca solo cada vez que prendes la computadora." & return & return & "¡Vas a lograrlo! 💚" buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon note
end doInstall

on doDeactivate(theMode)
	if theMode is "aleatorio" then
		try
			set res to do shell script "/bin/bash " & quoted form of (appDir & "/blocker.sh") & " stop /dev/null" with administrator privileges
		on error errMsg
			display dialog "No se pudo desactivar: " & errMsg buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
			return
		end try
	else
		set pw to askPassword("Escribe la contraseña de custodio para desactivar:")
		if pw is "" then return
		set pwPath to writePasswordTemp(pw)
		set res to do shell script "/bin/bash " & quoted form of (appDir & "/blocker.sh") & " stop " & quoted form of pwPath with administrator privileges
	end if

	if res contains "DESACTIVADO" then
		display dialog "Candado abierto. El bloqueo quedó desactivado." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas"
	else if res contains "CONTRASEÑA_INCORRECTA" then
		display dialog "Contraseña incorrecta." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	else if res contains "COMPROMISO_ACTIVO" then
		display dialog "Aún estás en tu período de compromiso. No se puede abrir todavía." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon caution
	else
		display dialog "No se pudo desactivar." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	end if
end doDeactivate

on run
	try
		set theState to readState()
		if item 1 of theState then
			set daysLeft to item 2 of theState
			set theMode to item 3 of theState
			if daysLeft > 0 then
				display dialog "Estado: ACTIVO 🛡️" & return & "Faltan " & (daysLeft as text) & " días de tu compromiso (no se puede desactivar antes)." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon note
			else
				set r to display dialog "Estado: ACTIVO 🛡️" & return & "Tu compromiso ya se cumplió. Puedes abrir el candado si quieres." buttons {"Cerrar", "Desactivar"} default button "Cerrar" with title "SinApuestas" with icon note
				if button returned of r is "Desactivar" then doDeactivate(theMode)
			end if
		else
			doInstall()
		end if
	on error errMsg number errNum
		if errNum is -128 then return -- cancelado por el usuario
		display dialog errMsg buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	end try
end run
